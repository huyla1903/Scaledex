@echo off
@rem @title        Scaledex - update data
@rem @version      0.1.1
@rem @author       La Gia Huy
@rem @since        2026-11-15
@rem @updated      2026-11-16
@rem @engine       Windows batch (cmd.exe)
@rem @target       Windows; Python 3, Node.js 18+, git, GitHub CLI (gh) logged in
@rem @about        Picks up new Pokemon Scale World sets in one go:
@rem               1. scraper/build_data.py --refresh-index (new figures, sets, prices)
@rem               2. tools/check.mjs (stops on broken data or JS), then
@rem                  tools/build.mjs (rebuilds dist/pwa and dist/scaledex)
@rem               3. asks before publishing: commits and pushes data/scaledex.json,
@rem                  then uploads the images release (tools/upload_images.ps1),
@rem                  which rebuilds the live web app.
@rem               Copy dist/scaledex into your vault's plugins folder yourself afterwards.
@rem @changelog    0.1.1  run tools/check.mjs before building and publishing
setlocal
cd /d "%~dp0"
title Scaledex update

for %%T in (python node git gh) do (
  where %%T >nul 2>nul || (echo %%T was not found on PATH. Install it and try again. & goto :fail)
)

echo.
echo === 1/3  Reading the official dex, Bandai Candy and Premium Bandai pages ===
echo     (only new or changed pages are downloaded; this can take a few minutes)
python scraper\build_data.py --refresh-index || goto :fail

echo.
echo === 2/3  Building the web app and the Obsidian plugin ===
node tools\check.mjs || goto :fail
node tools\build.mjs || goto :fail

echo.
echo === What changed ===
git status --short data\scaledex.json
git diff --quiet -- data\scaledex.json
if not errorlevel 1 (
  echo No data changes. The live site is already up to date.
  goto :done
)
git diff --stat -- data\scaledex.json

echo.
set "ANSWER="
set /p ANSWER="=== 3/3  Publish to GitHub now (push data + upload images)? [Y/N] "
if /i not "%ANSWER%"=="Y" (
  echo Not published. Run update.bat again when you want to publish.
  goto :done
)

for /f %%D in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%D"
git add data\scaledex.json || goto :fail
git commit -m "Data update %TODAY%" || goto :fail
git push || goto :fail
powershell -NoProfile -ExecutionPolicy Bypass -File tools\upload_images.ps1 || goto :fail
echo.
echo Published. The live site updates in about a minute: https://huyla1903.github.io/Scaledex/

:done
echo.
echo The Obsidian plugin is in dist\scaledex - copy it to your vault's .obsidian\plugins\scaledex folder.
echo.
pause
exit /b 0

:fail
echo.
echo Something went wrong - see the messages above. Nothing after the failed step was run.
echo.
pause
exit /b 1
