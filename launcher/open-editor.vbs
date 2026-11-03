' Business-Wrap launcher (0.17.0, N15): runs open-editor.mjs with no console window. Argument 1: the full path of node.exe (the shortcut passes it).
' It opens the editor in the browser and does NOT start the host: the host starts from the top-bar toggle (business-wrap://start).
Option Explicit
Dim sh, fso, here, node
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node"
If WScript.Arguments.Count > 0 Then
  If fso.FileExists(WScript.Arguments(0)) Then node = WScript.Arguments(0)
End If
sh.Run """" & node & """ """ & here & "\open-editor.mjs""", 0, False
