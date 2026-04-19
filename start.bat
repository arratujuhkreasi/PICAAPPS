@echo off
setlocal
echo Starting Reclipa...
call npm.cmd install
call npm.cmd run db:push
call npm.cmd run dev
