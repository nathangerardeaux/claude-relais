; Relais : personnalisation de l'installateur assisté (electron-builder, nsis.include).
;
; Page « Options » après le choix du dossier (nsDialogs) :
;   [x] Créer un raccourci sur le Bureau
;   [x] Ajouter au menu Démarrer
;   [ ] Lancer Relais au démarrage de Windows   (cochée d'office si c'était déjà activé)
;   [x] Lancer Relais à la fin de l'installation (au clic sur « Fermer »)
;
; Démarrage avec Windows : même réglage que dans l'appli (app.setLoginItemSettings), c'est-à-dire la
; valeur « fr.nybo.relais » = "<dossier>\Relais.exe" dans HKCU\Software\Microsoft\Windows\CurrentVersion\Run.
;
; Mode silencieux (/S) : AUCUN raccourci, pas de démarrage auto, pas de lancement, sauf demandé :
;   Relais-Setup-x.y.z.exe /S [--bureau] [--menu-demarrer] [--demarrage] [--lancer] [/D=D:\Apps\Relais]
;   (/D= toujours en dernier, sans guillemets). Mise à jour (--updated, lancée par l'appli) : on ne
;   touche ni aux raccourcis ni au démarrage auto.
;
; Désinstallation : retire les raccourcis créés par l'installateur (notés dans le registre de
; l'installation, donc pas un Relais.lnk fait à la main), la valeur Run si elle pointe vers ce dossier,
; et l'entrée « Applications » (electron-builder). Rien n'est retiré lors d'une mise à jour.

!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

; Texts of the Options page, in the installer language (chosen from the system language:
; French if Windows is in French, otherwise English). 1036 = French, 1033 = English.
LangString RelaisOptTitre 1036 "Options"
LangString RelaisOptTitre 1033 "Options"
LangString RelaisOptSousTitre 1036 "Choisis ce que l'installation doit faire."
LangString RelaisOptSousTitre 1033 "Choose what the installation should do."
LangString RelaisOptBureau 1036 "Créer un raccourci sur le Bureau"
LangString RelaisOptBureau 1033 "Create a desktop shortcut"
LangString RelaisOptMenu 1036 "Ajouter au menu Démarrer"
LangString RelaisOptMenu 1033 "Add to the Start menu"
LangString RelaisOptDemarrage 1036 "Lancer Relais au démarrage de Windows"
LangString RelaisOptDemarrage 1033 "Start Relais when Windows starts"
LangString RelaisOptLancer 1036 "Lancer Relais à la fin de l'installation"
LangString RelaisOptLancer 1033 "Launch Relais when the installation ends"
LangString RelaisOptNote 1036 "Le démarrage avec Windows se change ensuite dans Relais, page Paramètres."
LangString RelaisOptNote 1033 "Starting with Windows can be changed later in Relais, Settings page."

!define RELAIS_CLE_RUN "Software\Microsoft\Windows\CurrentVersion\Run"
!define RELAIS_CLE_APPROUVE "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

!ifndef BUILD_UNINSTALLER
  Var RelaisMaj
  Var RelaisBureau
  Var RelaisMenu
  Var RelaisDemarrage
  Var RelaisLancer
  Var RelaisCaseBureau
  Var RelaisCaseMenu
  Var RelaisCaseDemarrage
  Var RelaisCaseLancer
!endif

; Option de ligne de commande présente ? -> $R1 = 1 ou 0
!macro RelaisOption NOM
  ClearErrors
  ${GetOptions} $R0 "${NOM}" $R2
  ${If} ${Errors}
    StrCpy $R1 0
  ${Else}
    StrCpy $R1 1
  ${EndIf}
!macroend

!macro customInit
  ${GetParameters} $R0
  !insertmacro RelaisOption "--updated"
  StrCpy $RelaisMaj $R1
  ${If} ${Silent}
    !insertmacro RelaisOption "--bureau"
    StrCpy $RelaisBureau $R1
    !insertmacro RelaisOption "--menu-demarrer"
    StrCpy $RelaisMenu $R1
    !insertmacro RelaisOption "--demarrage"
    StrCpy $RelaisDemarrage $R1
    !insertmacro RelaisOption "--lancer"
    StrCpy $RelaisLancer $R1
  ${Else}
    StrCpy $RelaisBureau 1
    StrCpy $RelaisMenu 1
    StrCpy $RelaisLancer 1
    ReadRegStr $R1 HKCU "${RELAIS_CLE_RUN}" "${APP_ID}"
    ${If} $R1 == ""
      StrCpy $RelaisDemarrage 0
    ${Else}
      StrCpy $RelaisDemarrage 1
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom RelaisPageOptions RelaisPageOptionsQuitter

  Function RelaisPageOptions
    ${If} $RelaisMaj == 1
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(RelaisOptTitre)" "$(RelaisOptSousTitre)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateCheckbox} 0 6u 100% 12u "$(RelaisOptBureau)"
    Pop $RelaisCaseBureau
    ${NSD_SetState} $RelaisCaseBureau $RelaisBureau
    ${NSD_CreateCheckbox} 0 24u 100% 12u "$(RelaisOptMenu)"
    Pop $RelaisCaseMenu
    ${NSD_SetState} $RelaisCaseMenu $RelaisMenu
    ${NSD_CreateCheckbox} 0 42u 100% 12u "$(RelaisOptDemarrage)"
    Pop $RelaisCaseDemarrage
    ${NSD_SetState} $RelaisCaseDemarrage $RelaisDemarrage
    ${NSD_CreateCheckbox} 0 60u 100% 12u "$(RelaisOptLancer)"
    Pop $RelaisCaseLancer
    ${NSD_SetState} $RelaisCaseLancer $RelaisLancer
    ${NSD_CreateLabel} 0 86u 100% 30u "$(RelaisOptNote)"
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function RelaisPageOptionsQuitter
    ${NSD_GetState} $RelaisCaseBureau $RelaisBureau
    ${NSD_GetState} $RelaisCaseMenu $RelaisMenu
    ${NSD_GetState} $RelaisCaseDemarrage $RelaisDemarrage
    ${NSD_GetState} $RelaisCaseLancer $RelaisLancer
  FunctionEnd
!macroend

!macro RelaisRaccourci LIEN
  CreateShortCut "${LIEN}" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "${LIEN}" "${APP_ID}"
!macroend

!macro customInstall
  ; Relaunch after an update (--force-run): electron-builder starts "$SMPROGRAMS\Relais.lnk" whenever that
  ; file exists, whatever it points to (seen: a hand-made shortcut to a dev copy was started instead of
  ; the app just installed). Always the installed exe.
  StrCpy $launchLink "$appExe"
  ; electron-builder keeps a copy of this installer (~100 MB) in %LOCALAPPDATA%\<app>-updater\installer.exe
  ; for differential updates, and never removes it. Not wanted (nothing heavy on C:): removed; updates
  ; are then downloaded whole (still checked against the sha512 of latest.yml).
  !ifdef APP_INSTALLER_STORE_FILE
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    RMDir "$LOCALAPPDATA\relais-bureau-updater"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  !endif
  ${If} $RelaisMaj != 1
    ${If} $RelaisBureau == 1
      !insertmacro RelaisRaccourci "$newDesktopLink"
    ${EndIf}
    ${If} $RelaisMenu == 1
      !insertmacro RelaisRaccourci "$newStartMenuLink"
    ${EndIf}
    ; noted for the uninstaller (it only removes what the installer made)
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" RelaisRaccourciBureau $RelaisBureau
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" RelaisRaccourciMenu $RelaisMenu
    ${If} $RelaisDemarrage == 1
      WriteRegStr HKCU "${RELAIS_CLE_RUN}" "${APP_ID}" '"$appExe"'
    ${Else}
      ReadRegStr $R1 HKCU "${RELAIS_CLE_RUN}" "${APP_ID}"
      ${If} $R1 == '"$appExe"'
        DeleteRegValue HKCU "${RELAIS_CLE_RUN}" "${APP_ID}"
        DeleteRegValue HKCU "${RELAIS_CLE_APPROUVE}" "${APP_ID}"
      ${EndIf}
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
    ${If} ${Silent}
    ${AndIf} $RelaisLancer == 1
      ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" ""
    ${EndIf}
  ${EndIf}
!macroend

; Page de fin : lance Relais quand on clique sur « Fermer », si la case était cochée.
!macro customFinishPage
  Function RelaisFinQuitter
    ${If} $RelaisLancer == 1
      ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" ""
    ${EndIf}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE RelaisFinQuitter
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnInstall
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R2
  ${If} ${Errors}
    ReadRegStr $R3 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" RelaisRaccourciBureau
    ${If} $R3 == 1
      WinShell::UninstShortcut "$oldDesktopLink"
      Delete "$oldDesktopLink"
    ${EndIf}
    ReadRegStr $R3 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" RelaisRaccourciMenu
    ${If} $R3 == 1
      WinShell::UninstShortcut "$oldStartMenuLink"
      Delete "$oldStartMenuLink"
    ${EndIf}
    ReadRegStr $R1 HKCU "${RELAIS_CLE_RUN}" "${APP_ID}"
    ${If} $R1 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
      DeleteRegValue HKCU "${RELAIS_CLE_RUN}" "${APP_ID}"
      DeleteRegValue HKCU "${RELAIS_CLE_APPROUVE}" "${APP_ID}"
    ${EndIf}
    ; downloaded updates (default electron-updater cache, %LOCALAPPDATA%\<package name>-updater)
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$LOCALAPPDATA\relais-bureau-updater"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend
