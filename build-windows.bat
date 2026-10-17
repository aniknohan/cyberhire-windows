@echo off
REM Build CyberHire .exe on your own Windows PC.
REM Needs: Node.js 22 LTS (nodejs.org) and Python 3.12 (python.org, tick "Add python.exe to PATH").
setlocal
cd /d "%~dp0"

echo === 1/4 Interviewer photos ===
python scripts\bundle_images.py

echo === 2/4 App screens (React) ===
pushd frontend
call npx --yes yarn@1.22.22 install --network-timeout 600000 || goto :fail
call npx --yes yarn@1.22.22 build || goto :fail
popd

echo === 3/4 Local interview engine (Python) ===
pushd backend
python -m pip install -r requirements-desktop.txt pyinstaller==6.11.1 || goto :fail
python -m PyInstaller --noconfirm soc-backend.spec || goto :fail
popd

echo === 4/4 Windows installer ===
call npm install --no-audit --no-fund || goto :fail
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --publish never || goto :fail

echo.
echo Done! Your installers are in the "dist" folder:
dir /b dist\*.exe
pause
exit /b 0

:fail
echo.
echo Build failed - see the messages above.
pause
exit /b 1
