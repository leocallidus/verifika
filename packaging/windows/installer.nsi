Unicode true
Name "Verifika"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\Verifika"
RequestExecutionLevel admin

Page directory
Page instfiles

Section "Verifika"
  SetOutPath "$INSTDIR"
  File "/oname=Verifika.exe" "${BINFILE}"
  CreateDirectory "$SMPROGRAMS\Verifika"
  CreateShortcut "$SMPROGRAMS\Verifika\Verifika.lnk" "$INSTDIR\Verifika.exe"
  CreateShortcut "$DESKTOP\Verifika.lnk" "$INSTDIR\Verifika.exe"
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Verifika.lnk"
  Delete "$SMPROGRAMS\Verifika\Verifika.lnk"
  RMDir "$SMPROGRAMS\Verifika"
  Delete "$INSTDIR\Verifika.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
