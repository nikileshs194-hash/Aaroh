' Starts Aaroh in the background when Windows starts (added by Settings > Start-up).
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run """" & root & "\.venv\Scripts\pythonw.exe"" """ & root & "\backend\run.py""", 0, False
