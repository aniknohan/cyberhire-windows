// Run after `npx cap add android`: camera + microphone permissions, launch-time permission prompt,
// and release signing from environment variables (set by the GitHub build from repository secrets).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "android", "app", "src", "main");

const manifestPath = path.join(root, "AndroidManifest.xml");
let xml = fs.readFileSync(manifestPath, "utf8");
for (const p of [
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.front" android:required="false" />',
  '<uses-feature android:name="android.hardware.microphone" android:required="false" />',
]) {
  const name = p.match(/android:name="([^"]+)"/)[1];
  if (!xml.includes(name)) xml = xml.replace("</manifest>", `    ${p}\n</manifest>`);
}
// works on both screens of foldables without restarting the interview
xml = xml.replace('<activity', '<activity android:resizeableActivity="true"').replace('android:resizeableActivity="true" android:resizeableActivity="true"', 'android:resizeableActivity="true"');
fs.writeFileSync(manifestPath, xml);

const javaDir = path.join(root, "java", "com", "cyberhire", "mobile");
fs.mkdirSync(javaDir, { recursive: true });
fs.writeFileSync(path.join(javaDir, "MainActivity.java"), `package com.cyberhire.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String[] perms = { Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS };
        boolean missing = false;
        for (String p : perms) if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) missing = true;
        if (missing) ActivityCompat.requestPermissions(this, perms, 1001);
    }
}
`);

const gradlePath = path.join(__dirname, "..", "android", "app", "build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");
if (process.env.CH_KEYSTORE && !gradle.includes("signingConfigs {")) {
  gradle = gradle.replace(/android\s*\{/, `android {
    signingConfigs {
        release {
            storeFile file(System.getenv("CH_KEYSTORE"))
            storePassword System.getenv("CH_KEYSTORE_PASSWORD")
            keyAlias System.getenv("CH_KEY_ALIAS")
            keyPassword System.getenv("CH_KEY_PASSWORD")
        }
    }`);
  gradle = gradle.replace(/buildTypes\s*\{\s*release\s*\{/, "buildTypes {\n        release {\n            signingConfig signingConfigs.release");
  console.log("Android: release signing configured.");
}
if (!process.env.CH_KEYSTORE && !gradle.includes("cyberhireDebug")) {
  // fixed debug key (keys/debug.keystore) so each new build installs over the previous one
  gradle = gradle.replace(/android\s*\{/, `android {
    signingConfigs {
        cyberhireDebug {
            storeFile file("../../keys/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }`);
  gradle = gradle.replace(/buildTypes\s*\{/, "buildTypes {\n        debug {\n            signingConfig signingConfigs.cyberhireDebug\n        }");
}
const ver = require("../package.json").version; const code = Number(process.env.GITHUB_RUN_NUMBER || 1);
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${ver}"`);
fs.writeFileSync(gradlePath, gradle);
console.log("Android: camera + microphone permissions added; version", ver, "build", code);
