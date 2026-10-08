# Crée un raccourci « Relais » vers Relais.exe sur le Bureau et dans le menu Démarrer (utilisateur
# courant, pas besoin d'être administrateur). Le raccourci porte le même identifiant d'application
# (AppUserModelID « fr.nybo.relais ») que la fenêtre : épinglé à la barre des tâches, il se regroupe
# avec la fenêtre ouverte au lieu de faire une 2e icône.
#
# Ce que ce script écrit sur le PC (deux petits fichiers .lnk, environ 2 Ko chacun) :
#   - <Bureau>\Relais.lnk
#   - %APPDATA%\Microsoft\Windows\Start Menu\Programs\Relais.lnk
# Rien d'autre : pas de registre, pas d'installation. Pour annuler : supprimer ces deux fichiers
# (ou relancer ce script avec -Supprimer).
#
# Usage (PowerShell) :
#   powershell -ExecutionPolicy Bypass -File D:\claude-relais\tableau\bureau\creer-raccourci.ps1
#   ... -SansBureau      (menu Démarrer seulement)
#   ... -Supprimer       (enlève les deux raccourcis)
[CmdletBinding()]
param(
  [string]$Exe = '',
  [switch]$SansBureau,
  [switch]$Supprimer
)
$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 : $PSScriptRoot peut être vide dans les valeurs par défaut de param() ; on
# calcule donc le dossier du script ici, avec repli sur $MyInvocation.
$ici = $PSScriptRoot
if (-not $ici) { $ici = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Exe) { $Exe = Join-Path $ici 'dist\win-unpacked\Relais.exe' }

$cibles = @()
if (-not $SansBureau) { $cibles += Join-Path ([Environment]::GetFolderPath('Desktop')) 'Relais.lnk' }
$cibles += Join-Path ([Environment]::GetFolderPath('Programs')) 'Relais.lnk'

if ($Supprimer) {
  foreach ($lnk in $cibles) {
    if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk; Write-Host "Supprimé : $lnk" }
  }
  return
}

if (-not (Test-Path -LiteralPath $Exe)) {
  Write-Error "Relais.exe introuvable : $Exe`nConstruis-le d'abord : cd $ici ; npm run construire"
}
$Exe = (Resolve-Path -LiteralPath $Exe).Path

# IShellLink + IPropertyStore : le seul moyen de poser l'AppUserModelID sur un .lnk (WScript.Shell ne sait pas).
$code = @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace RelaisRaccourci {
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cch, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
  }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    void GetCount(out uint cProps);
    void GetAt(uint iProp, out PropertyKey pkey);
    void GetValue(ref PropertyKey key, out PropVariant pv);
    void SetValue(ref PropertyKey key, ref PropVariant pv);
    void Commit();
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  struct PropertyKey { public Guid fmtid; public uint pid; }

  [StructLayout(LayoutKind.Explicit, Size = 24)]
  struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }

  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  class CShellLink { }

  public static class Lien {
    public static void Creer(string lnk, string cible, string dossier, string description, string idAppli) {
      IShellLinkW lien = (IShellLinkW)new CShellLink();
      lien.SetPath(cible);
      lien.SetWorkingDirectory(dossier);
      lien.SetIconLocation(cible, 0);
      lien.SetDescription(description);
      IPropertyStore props = (IPropertyStore)lien;
      PropertyKey cle = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 }; // PKEY_AppUserModel_ID
      PropVariant val = new PropVariant { vt = 31 /* VT_LPWSTR */, p = Marshal.StringToCoTaskMemUni(idAppli) };
      try { props.SetValue(ref cle, ref val); props.Commit(); }
      finally { Marshal.FreeCoTaskMem(val.p); }
      ((IPersistFile)lien).Save(lnk, true);
    }
  }
}
'@
if (-not ('RelaisRaccourci.Lien' -as [type])) { Add-Type -TypeDefinition $code -Language CSharp }

foreach ($lnk in $cibles) {
  New-Item -ItemType Directory -Force -Path (Split-Path $lnk) | Out-Null
  [RelaisRaccourci.Lien]::Creer($lnk, $Exe, (Split-Path $Exe), 'Relais : tableau de bord des conversations Claude Code', 'fr.nybo.relais')
  Write-Host "Raccourci créé : $lnk -> $Exe"
}
