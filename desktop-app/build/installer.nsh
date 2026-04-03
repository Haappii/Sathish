!macro customInstall
  DetailPrint "Installing bundled SC588 printer driver..."
  ; extraResources are placed under $INSTDIR\resources
  ExecWait '"$INSTDIR\\resources\\drivers\\SP-DRV2155Win.exe" /VERYSILENT /NORESTART' $0
  DetailPrint "Driver installer exit code: $0"
!macroend

!macro customUnInstall
  RMDir /r "$LOCALAPPDATA\\Haappii Billing"
!macroend
