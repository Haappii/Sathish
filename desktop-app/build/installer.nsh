!macro customInstall
  ; ── SC588 Thermal Printer Driver ─────────────────────────────────────────
  ; Check if the driver is already installed by looking for its registry key
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Print\Printers\SC-58USB-Series" "Name"
  ${If} $0 != ""
    DetailPrint "SC588 printer driver already installed, skipping."
  ${Else}
    DetailPrint "Installing SC588 thermal printer driver..."
    SetDetailsPrint both

    ; The driver exe is placed under $INSTDIR\resources\drivers\ by extraResources
    StrCpy $1 "$INSTDIR\resources\drivers\SP-DRV2155Win.exe"

    ${If} ${FileExists} "$1"
      ; Try Inno Setup silent flags first (/VERYSILENT /NORESTART)
      ExecWait '"$1" /VERYSILENT /NORESTART /SP-' $0
      ${If} $0 != 0
        ; Some installers use /S (NSIS-style) — try that as fallback
        ExecWait '"$1" /S /NORESTART' $0
      ${EndIf}
      ${If} $0 == 0
        DetailPrint "Printer driver installed successfully."
      ${Else}
        DetailPrint "Printer driver installer returned code $0."
        MessageBox MB_ICONINFORMATION|MB_OK \
          "The SC588 printer driver could not be installed automatically (code: $0).$\n$\nPlease run the driver installer manually from:$\n$1$\n$\nYou can also install it later from the app's resources folder."
      ${EndIf}
    ${Else}
      DetailPrint "Driver installer not found at: $1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  RMDir /r "$LOCALAPPDATA\Haappii Billing"
!macroend
