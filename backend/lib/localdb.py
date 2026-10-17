"""Embedded, file-backed stand-in for the async MongoDB (motor) API used by this app.

The desktop app has no MongoDB server, so every collection lives in one local SQLite file.
Documents are kept in memory for querying and written through to SQLite on every change,
so data survives restarts. Only the subset of the motor/pymongo API the app uses is
implemented: find / find_one (projection, sort, skip, limit, to_list, async-for),
insert_one / insert_many, update_one / update_many ($set, $unset, $inc, $push(+$each),
$addToSet, $pull, $setOnInsert, upsert), delete_one / delete_many, count_documents,
distinct, aggregate ($match, $group, $sort, $limit, $skip, $project) and create_indexes
(unique indexes are enforced).
"""
from __future__ import annotations

import copy
import json
import re
import sqlite3
import threading
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ASCENDING = 1
DESCENDING = -1
_MISSING = object()


class DuplicateKeyError(Exception):
    pass


class IndexModel:
    def __init__(self, keys, name: str | None = None, unique: bool = False, **_kw):
        self.keys = [(k, d) for k, d in keys]
        self.document = {"name": name or "_".join(f"{k}_{d}" for k, d in self.keys), "unique": unique}


# ───────────────────────────── (de)serialization ─────────────────────────────

def _enc(o: Any) -> Any:
    if isinstance(o, datetime):
        if o.tzinfo is not None:
            o = o.astimezone(timezone.utc).replace(tzinfo=None)
        return {"$date": o.isoformat()}
    if isinstance(o, date):
        return {"$date": datetime(o.year, o.month, o.day).isoformat()}
    if isinstance(o, dict):
        return {str(k): _enc(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [_enc(v) for v in o]
    if hasattr(o, "model_dump"):
        return _enc(o.model_dump())
    if isinstance(o, (bytes, bytearray)):
        return {"$bytes": bytes(o).hex()}
    if o is None or isinstance(o, (str, int, float, bool)):
        return o
    return str(o)


def _dec(o: Any) -> Any:
    if isinstance(o, dict):
        if len(o) == 1 and "$date" in o:
            return datetime.fromisoformat(o["$date"])  # naive UTC, exactly like pymongo
        if len(o) == 1 and "$bytes" in o:
            return bytes.fromhex(o["$bytes"])
        return {k: _dec(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_dec(v) for v in o]
    return o


def _normalize(doc: dict) -> dict:
    """What Mongo would store: datetimes become naive UTC, tuples become lists."""
    return _dec(_enc(doc))


# ───────────────────────────── path helpers ─────────────────────────────

def _get_path(doc: Any, path: str) -> list:
    """All values reachable at a dotted path (arrays fan out, numeric parts index lists)."""
    cur = [doc]
    for part in path.split("."):
        nxt = []
        for c in cur:
            if isinstance(c, dict):
                if part in c:
                    nxt.append(c[part])
            elif isinstance(c, list):
                if part.isdigit():
                    i = int(part)
                    if i < len(c):
                        nxt.append(c[i])
                else:
                    for el in c:
                        if isinstance(el, dict) and part in el:
                            nxt.append(el[part])
        cur = nxt
        if not cur:
            return []
    return cur


def _get_one(doc: Any, path: str, default=None):
    vals = _get_path(doc, path)
    return vals[0] if vals else default


def _set_path(doc: dict, path: str, value: Any) -> None:
    parts = path.split(".")
    cur: Any = doc
    for i, part in enumerate(parts):
        last = i == len(parts) - 1
        if isinstance(cur, list):
            idx = int(part)
            while len(cur) <= idx:
                cur.append(None)
            if last:
                cur[idx] = value
            else:
                if not isinstance(cur[idx], (dict, list)):
                    cur[idx] = {}
                cur = cur[idx]
        else:
            if last:
                cur[part] = value
            else:
                if not isinstance(cur.get(part), (dict, list)):
                    cur[part] = {}
                cur = cur[part]


def _unset_path(doc: dict, path: str) -> None:
    parts = path.split(".")
    cur: Any = doc
    for part in parts[:-1]:
        if isinstance(cur, list):
            cur = cur[int(part)] if part.isdigit() and int(part) < len(cur) else None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        if cur is None:
            return
    if isinstance(cur, dict):
        cur.pop(parts[-1], None)
    elif isinstance(cur, list) and parts[-1].isdigit() and int(parts[-1]) < len(cur):
        cur[int(parts[-1])] = None


# ───────────────────────────── matching ─────────────────────────────

def _cmp_key(v: Any):
    """Total ordering across types, roughly following Mongo's BSON order."""
    if v is None:
        return (1, 0)
    if isinstance(v, bool):
        return (8, int(v))
    if isinstance(v, (int, float)):
        return (3, v)
    if isinstance(v, str):
        return (4, v)
    if isinstance(v, dict):
        return (5, json.dumps(_enc(v), sort_keys=True))
    if isinstance(v, list):
        return (6, json.dumps(_enc(v), sort_keys=True))
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return (9, v.timestamp())
    return (10, str(v))


def _eq(a: Any, b: Any) -> bool:
    if isinstance(a, datetime) and isinstance(b, datetime):
        return _cmp_key(a) == _cmp_key(b)
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    return a == b


def _value_matches(vals: list, cond: Any) -> bool:
    """vals = every value at the path (empty list = field missing)."""
    if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
        return all(_op_matches(vals, op, arg) for op, arg in cond.items() if op != "$options")
    return _op_matches(vals, "$eq", cond)


def _expand(vals: list) -> list:
    out = []
    for v in vals:
        out.append(v)
        if isinstance(v, list):
            out.extend(v)
    return out


def _op_matches(vals: list, op: str, arg: Any) -> bool:
    ev = _expand(vals)
    if op == "$eq":
        if arg is None:
            return not vals or any(v is None for v in ev)
        return any(_eq(v, arg) for v in ev)
    if op == "$ne":
        return not _op_matches(vals, "$eq", arg)
    if op == "$in":
        return any(_op_matches(vals, "$eq", a) for a in arg)
    if op == "$nin":
        return not _op_matches(vals, "$in", arg)
    if op in ("$gt", "$gte", "$lt", "$lte"):
        if arg is None:
            return False
        ka = _cmp_key(arg)
        for v in ev:
            if v is None:
                continue
            kv = _cmp_key(v)
            if kv[0] != ka[0] and not ({kv[0], ka[0]} <= {3}):
                continue
            if (op == "$gt" and kv > ka) or (op == "$gte" and kv >= ka) or (op == "$lt" and kv < ka) or (op == "$lte" and kv <= ka):
                return True
        return False
    if op == "$exists":
        return bool(vals) == bool(arg)
    if op == "$regex":
        flags = 0
        pat = arg
        if isinstance(arg, re.Pattern):
            pat, flags = arg.pattern, arg.flags
        return any(isinstance(v, str) and re.search(pat, v, flags) for v in ev)
    if op == "$size":
        return any(isinstance(v, list) and len(v) == arg for v in vals)
    if op == "$all":
        return all(_op_matches(vals, "$eq", a) for a in arg)
    if op == "$not":
        return not _value_matches(vals, arg)
    if op == "$elemMatch":
        return any(isinstance(v, list) and any(isinstance(e, dict) and matches(e, arg) for e in v) for v in vals)
    raise NotImplementedError(f"query operator {op}")


def matches(doc: dict, flt: dict | None) -> bool:
    if not flt:
        return True
    for key, cond in flt.items():
        if key == "$and":
            if not all(matches(doc, f) for f in cond):
                return False
        elif key == "$or":
            if not any(matches(doc, f) for f in cond):
                return False
        elif key == "$nor":
            if any(matches(doc, f) for f in cond):
                return False
        else:
            if isinstance(cond, re.Pattern):
                cond = {"$regex": cond}
            if not _value_matches(_get_path(doc, key), cond):
                return False
    return True


# ───────────────────────────── projection / sort ─────────────────────────────

def _project(doc: dict, projection: dict | list | None) -> dict:
    doc = copy.deepcopy(doc)
    if not projection:
        return doc
    if isinstance(projection, list):
        projection = {k: 1 for k in projection}
    include = {k: v for k, v in projection.items() if k != "_id" and v}
    exclude = [k for k, v in projection.items() if not v]
    if include:
        out: dict = {}
        if projection.get("_id", 1) and "_id" in doc:
            out["_id"] = doc["_id"]
        for k in include:
            v = _get_one(doc, k, _MISSING)
            if v is not _MISSING:
                _set_path(out, k, v)
        return out
    for k in exclude:
        _unset_path(doc, k)
    return doc


def _sort_spec(key, direction=None) -> list[tuple[str, int]]:
    if isinstance(key, str):
        return [(key, direction if direction is not None else ASCENDING)]
    if isinstance(key, dict):
        return list(key.items())
    return [(k, d) for k, d in key]


def _sorted(docs: list[dict], spec: list[tuple[str, int]]) -> list[dict]:
    for field, direction in reversed(spec):
        docs = sorted(docs, key=lambda d: _cmp_key(_get_one(d, field)), reverse=direction == DESCENDING)
    return docs


# ───────────────────────────── updates ─────────────────────────────

def _apply_update(doc: dict, update: dict, inserting: bool = False) -> None:
    if update and not any(k.startswith("$") for k in update):  # replacement document
        keep = doc.get("_id")
        doc.clear()
        doc.update(copy.deepcopy(update))
        if keep is not None:
            doc["_id"] = keep
        return
    for op, fields in update.items():
        if op == "$setOnInsert" and not inserting:
            continue
        for path, val in fields.items():
            val = copy.deepcopy(val)
            if op in ("$set", "$setOnInsert"):
                _set_path(doc, path, val)
            elif op == "$unset":
                _unset_path(doc, path)
            elif op == "$inc":
                _set_path(doc, path, (_get_one(doc, path) or 0) + val)
            elif op == "$mul":
                _set_path(doc, path, (_get_one(doc, path) or 0) * val)
            elif op == "$min":
                cur = _get_one(doc, path, _MISSING)
                if cur is _MISSING or _cmp_key(val) < _cmp_key(cur):
                    _set_path(doc, path, val)
            elif op == "$max":
                cur = _get_one(doc, path, _MISSING)
                if cur is _MISSING or _cmp_key(val) > _cmp_key(cur):
                    _set_path(doc, path, val)
            elif op in ("$push", "$addToSet"):
                cur = _get_one(doc, path)
                if cur is None:
                    cur = []
                    _set_path(doc, path, cur)
                items = val["$each"] if isinstance(val, dict) and "$each" in val else [val]
                for it in items:
                    if op == "$addToSet" and any(_eq(it, c) for c in cur):
                        continue
                    cur.append(it)
                if isinstance(val, dict) and "$slice" in val:
                    n = val["$slice"]
                    cur[:] = cur[n:] if n < 0 else cur[:n]
            elif op == "$pull":
                cur = _get_one(doc, path)
                if isinstance(cur, list):
                    if isinstance(val, dict):
                        cur[:] = [c for c in cur if not (matches(c, val) if isinstance(c, dict) else _value_matches([c], val))]
                    else:
                        cur[:] = [c for c in cur if not _eq(c, val)]
            elif op == "$pop":
                cur = _get_one(doc, path)
                if isinstance(cur, list) and cur:
                    cur.pop(0 if val == -1 else -1)
            elif op == "$currentDate":
                _set_path(doc, path, datetime.now(timezone.utc).replace(tzinfo=None))
            else:
                raise NotImplementedError(f"update operator {op}")


# ───────────────────────────── results ─────────────────────────────

class InsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id
        self.acknowledged = True


class InsertManyResult:
    def __init__(self, ids):
        self.inserted_ids = ids
        self.acknowledged = True


class UpdateResult:
    def __init__(self, matched: int, modified: int, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id
        self.acknowledged = True


class DeleteResult:
    def __init__(self, n: int):
        self.deleted_count = n
        self.acknowledged = True


# ───────────────────────────── storage ─────────────────────────────

class _Store:
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, _id TEXT NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (coll, _id))")
        self.conn.execute("CREATE TABLE IF NOT EXISTS idx (coll TEXT NOT NULL, name TEXT NOT NULL, spec TEXT NOT NULL, PRIMARY KEY (coll, name))")
        self.data: dict[str, dict[str, dict]] = {}
        self.unique: dict[str, dict[str, list[str]]] = {}
        for coll, _id, raw in self.conn.execute("SELECT coll, _id, doc FROM docs ORDER BY rowid"):
            self.data.setdefault(coll, {})[_id] = _dec(json.loads(raw))
        for coll, name, spec in self.conn.execute("SELECT coll, name, spec FROM idx"):
            s = json.loads(spec)
            if s.get("unique"):
                self.unique.setdefault(coll, {})[name] = s["keys"]

    def coll(self, name: str) -> dict[str, dict]:
        return self.data.setdefault(name, {})

    def write(self, coll: str, doc: dict) -> None:
        self.conn.execute("INSERT OR REPLACE INTO docs (coll, _id, doc) VALUES (?, ?, ?)",
                          (coll, str(doc["_id"]), json.dumps(_enc(doc), ensure_ascii=False)))

    def remove(self, coll: str, _id: str) -> None:
        self.conn.execute("DELETE FROM docs WHERE coll=? AND _id=?", (coll, str(_id)))

    def check_unique(self, coll: str, doc: dict, skip_id: str | None = None) -> None:
        for name, keys in self.unique.get(coll, {}).items():
            key = tuple(json.dumps(_enc(_get_one(doc, k)), sort_keys=True) for k in keys)
            for other_id, other in self.coll(coll).items():
                if other_id == skip_id:
                    continue
                if tuple(json.dumps(_enc(_get_one(other, k)), sort_keys=True) for k in keys) == key:
                    raise DuplicateKeyError(f"E11000 duplicate key error collection: {coll} index: {name}")


# ───────────────────────────── cursor / collection ─────────────────────────────

class Cursor:
    def __init__(self, coll: "Collection", flt, projection):
        self._coll, self._flt, self._proj = coll, flt or {}, projection
        self._sort: list[tuple[str, int]] = []
        self._skip = 0
        self._limit = 0
        self._buf: list[dict] | None = None

    def sort(self, key, direction=None):
        self._sort.extend(_sort_spec(key, direction))
        return self

    def skip(self, n: int):
        self._skip = n
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def _run(self) -> list[dict]:
        with self._coll._store.lock:
            docs = [d for d in self._coll._docs().values() if matches(d, self._flt)]
            if self._sort:
                docs = _sorted(docs, self._sort)
            if self._skip:
                docs = docs[self._skip:]
            if self._limit:
                docs = docs[: self._limit]
            return [_project(d, self._proj) for d in docs]

    async def to_list(self, length: int | None = None) -> list[dict]:
        docs = self._run()
        return docs[:length] if length else docs

    def __aiter__(self):
        self._buf = self._run()
        return self

    async def __anext__(self):
        if not self._buf:
            raise StopAsyncIteration
        return self._buf.pop(0)


class AggCursor:
    def __init__(self, docs: list[dict]):
        self._docs = docs

    async def to_list(self, length: int | None = None) -> list[dict]:
        return self._docs[:length] if length else list(self._docs)

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


def _expr(doc: dict, e: Any) -> Any:
    if isinstance(e, str) and e.startswith("$"):
        return _get_one(doc, e[1:])
    if isinstance(e, dict):
        return {k: _expr(doc, v) for k, v in e.items()}
    return e


class Collection:
    def __init__(self, store: _Store, name: str):
        self._store, self.name = store, name

    def _docs(self) -> dict[str, dict]:
        return self._store.coll(self.name)

    # reads
    def find(self, filter: dict | None = None, projection: dict | None = None, sort=None, limit: int = 0, skip: int = 0, **_kw) -> Cursor:
        c = Cursor(self, filter, projection)
        if sort:
            c.sort(sort)
        if limit:
            c.limit(limit)
        if skip:
            c.skip(skip)
        return c

    async def find_one(self, filter: dict | None = None, projection: dict | None = None, sort=None, **_kw) -> dict | None:
        docs = await self.find(filter, projection, sort=sort, limit=1).to_list(1)
        return docs[0] if docs else None

    async def count_documents(self, filter: dict | None = None, **_kw) -> int:
        with self._store.lock:
            return sum(1 for d in self._docs().values() if matches(d, filter or {}))

    async def estimated_document_count(self, **_kw) -> int:
        return len(self._docs())

    async def distinct(self, key: str, filter: dict | None = None, **_kw) -> list:
        out: list = []
        with self._store.lock:
            for d in self._docs().values():
                if matches(d, filter or {}):
                    for v in _expand(_get_path(d, key)):
                        if not isinstance(v, list) and not any(_eq(v, o) for o in out):
                            out.append(copy.deepcopy(v))
        return out

    def aggregate(self, pipeline: list[dict], **_kw) -> AggCursor:
        with self._store.lock:
            docs = [copy.deepcopy(d) for d in self._docs().values()]
        for stage in pipeline:
            (op, arg), = stage.items()
            if op == "$match":
                docs = [d for d in docs if matches(d, arg)]
            elif op == "$sort":
                docs = _sorted(docs, _sort_spec(arg))
            elif op == "$limit":
                docs = docs[:arg]
            elif op == "$skip":
                docs = docs[arg:]
            elif op == "$project":
                docs = [_project(d, {k: v for k, v in arg.items() if v in (0, 1, True, False)}) for d in docs]
            elif op == "$count":
                docs = [{arg: len(docs)}]
            elif op == "$unwind":
                path = arg if isinstance(arg, str) else arg["path"]
                path = path[1:]
                nd = []
                for d in docs:
                    v = _get_one(d, path)
                    if isinstance(v, list):
                        for el in v:
                            c = copy.deepcopy(d)
                            _set_path(c, path, el)
                            nd.append(c)
                docs = nd
            elif op == "$group":
                groups: dict[str, dict] = {}
                order: list[str] = []
                for d in docs:
                    gid = _expr(d, arg["_id"])
                    k = json.dumps(_enc(gid), sort_keys=True)
                    if k not in groups:
                        groups[k] = {"_id": gid, "__vals": {f: [] for f in arg if f != "_id"}}
                        order.append(k)
                    for f, acc in arg.items():
                        if f == "_id":
                            continue
                        (aop, aexpr), = acc.items()
                        groups[k]["__vals"][f].append(_expr(d, aexpr))
                out = []
                for k in order:
                    g = groups[k]
                    row = {"_id": g["_id"]}
                    for f, acc in arg.items():
                        if f == "_id":
                            continue
                        (aop, _), = acc.items()
                        vals = g["__vals"][f]
                        nums = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
                        if aop == "$sum":
                            row[f] = sum(nums)
                        elif aop == "$avg":
                            row[f] = (sum(nums) / len(nums)) if nums else None
                        elif aop == "$min":
                            pres = [v for v in vals if v is not None]
                            row[f] = min(pres, key=_cmp_key) if pres else None
                        elif aop == "$max":
                            pres = [v for v in vals if v is not None]
                            row[f] = max(pres, key=_cmp_key) if pres else None
                        elif aop == "$push":
                            row[f] = vals
                        elif aop == "$addToSet":
                            u: list = []
                            for v in vals:
                                if not any(_eq(v, o) for o in u):
                                    u.append(v)
                            row[f] = u
                        elif aop == "$first":
                            row[f] = vals[0] if vals else None
                        elif aop == "$last":
                            row[f] = vals[-1] if vals else None
                        else:
                            raise NotImplementedError(f"accumulator {aop}")
                    out.append(row)
                docs = out
            else:
                raise NotImplementedError(f"aggregate stage {op}")
        return AggCursor(docs)

    # writes
    async def insert_one(self, document: dict, **_kw) -> InsertOneResult:
        with self._store.lock:
            if "_id" not in document:
                document["_id"] = uuid.uuid4().hex  # pymongo also adds _id to the caller's dict
            doc = _normalize(document)
            _id = str(doc["_id"])
            if _id in self._docs():
                raise DuplicateKeyError(f"E11000 duplicate key error collection: {self.name} index: _id_")
            self._store.check_unique(self.name, doc)
            self._docs()[_id] = doc
            self._store.write(self.name, doc)
            return InsertOneResult(document["_id"])

    async def insert_many(self, documents: list[dict], **_kw) -> InsertManyResult:
        ids = []
        with self._store.lock:
            self._store.conn.execute("BEGIN")
            try:
                for d in documents:
                    ids.append((await self.insert_one(d)).inserted_id)
                self._store.conn.execute("COMMIT")
            except Exception:
                self._store.conn.execute("ROLLBACK")
                raise
        return InsertManyResult(ids)

    async def _update(self, filter: dict, update: dict, upsert: bool, many: bool) -> UpdateResult:
        with self._store.lock:
            targets = [d for d in self._docs().values() if matches(d, filter or {})]
            if not many:
                targets = targets[:1]
            if not targets:
                if not upsert:
                    return UpdateResult(0, 0)
                doc: dict = {k: copy.deepcopy(v) for k, v in (filter or {}).items()
                             if not k.startswith("$") and not (isinstance(v, dict) and any(str(x).startswith("$") for x in v))}
                seed = {}
                for k, v in doc.items():
                    _set_path(seed, k, v)
                doc = seed
                _apply_update(doc, update, inserting=True)
                doc.setdefault("_id", uuid.uuid4().hex)
                doc = _normalize(doc)
                self._store.check_unique(self.name, doc)
                self._docs()[str(doc["_id"])] = doc
                self._store.write(self.name, doc)
                return UpdateResult(0, 0, doc["_id"])
            modified = 0
            for d in targets:
                before = json.dumps(_enc(d), sort_keys=True)
                new = copy.deepcopy(d)
                _apply_update(new, update)
                new = _normalize(new)
                if json.dumps(_enc(new), sort_keys=True) != before:
                    self._store.check_unique(self.name, new, skip_id=str(d["_id"]))
                    d.clear()
                    d.update(new)
                    self._store.write(self.name, d)
                    modified += 1
            return UpdateResult(len(targets), modified)

    async def update_one(self, filter: dict, update: dict, upsert: bool = False, **_kw) -> UpdateResult:
        return await self._update(filter, update, upsert, many=False)

    async def update_many(self, filter: dict, update: dict, upsert: bool = False, **_kw) -> UpdateResult:
        return await self._update(filter, update, upsert, many=True)

    async def replace_one(self, filter: dict, replacement: dict, upsert: bool = False, **_kw) -> UpdateResult:
        return await self._update(filter, replacement, upsert, many=False)

    async def find_one_and_update(self, filter: dict, update: dict, projection=None, upsert: bool = False,
                                  return_document: bool = False, sort=None, **_kw) -> dict | None:
        before = await self.find_one(filter, sort=sort)
        if before is None and not upsert:
            return None
        flt = {"_id": before["_id"]} if before else filter
        res = await self._update(flt, update, upsert, many=False)
        if return_document:
            _id = before["_id"] if before else res.upserted_id
            return await self.find_one({"_id": _id}, projection)
        return _project(before, projection) if before else None

    async def _delete(self, filter: dict, many: bool) -> DeleteResult:
        with self._store.lock:
            ids = [i for i, d in self._docs().items() if matches(d, filter or {})]
            if not many:
                ids = ids[:1]
            for i in ids:
                del self._docs()[i]
                self._store.remove(self.name, i)
            return DeleteResult(len(ids))

    async def delete_one(self, filter: dict, **_kw) -> DeleteResult:
        return await self._delete(filter, many=False)

    async def delete_many(self, filter: dict, **_kw) -> DeleteResult:
        return await self._delete(filter, many=True)

    async def create_indexes(self, models: list[IndexModel], **_kw) -> list[str]:
        names = []
        with self._store.lock:
            for m in models:
                keys = [k for k, _ in m.keys]
                name = m.document["name"]
                if m.document.get("unique"):
                    seen = set()
                    for d in self._docs().values():
                        key = tuple(json.dumps(_enc(_get_one(d, k)), sort_keys=True) for k in keys)
                        if key in seen:
                            raise DuplicateKeyError(f"cannot build unique index {name}: duplicate key")
                        seen.add(key)
                    self._store.unique.setdefault(self.name, {})[name] = keys
                self._store.conn.execute("INSERT OR REPLACE INTO idx (coll, name, spec) VALUES (?, ?, ?)",
                                         (self.name, name, json.dumps({"keys": keys, "unique": bool(m.document.get("unique"))})))
                names.append(name)
        return names

    async def create_index(self, keys, unique: bool = False, name: str | None = None, **_kw) -> str:
        return (await self.create_indexes([IndexModel(_sort_spec(keys), name=name, unique=unique)]))[0]

    async def drop(self) -> None:
        with self._store.lock:
            self._store.data.pop(self.name, None)
            self._store.conn.execute("DELETE FROM docs WHERE coll=?", (self.name,))


class Database:
    def __init__(self, store: _Store, name: str):
        self._store, self.name = store, name
        self._colls: dict[str, Collection] = {}

    def __getitem__(self, name: str) -> Collection:
        if name not in self._colls:
            self._colls[name] = Collection(self._store, name)
        return self._colls[name]

    def __getattr__(self, name: str) -> Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    async def list_collection_names(self) -> list[str]:
        return [k for k, v in self._store.data.items() if v]


class LocalClient:
    """Drop-in for AsyncIOMotorClient(...): client[db_name].collection.find(...)."""

    def __init__(self, path: str | Path):
        self._store = _Store(path)

    def __getitem__(self, name: str) -> Database:
        return Database(self._store, name)

    def close(self) -> None:
        try:
            self._store.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception:
            pass
