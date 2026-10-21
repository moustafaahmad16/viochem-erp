; Lets other computers and phones on the same Wi-Fi reach VIOCHEM, on private and public networks alike,
; without Windows asking. Removed again on uninstall. The data folder is never touched.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="VIOCHEM"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="VIOCHEM" dir=in action=allow protocol=TCP localport=3000 profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="VIOCHEM" dir=in action=allow protocol=UDP localport=5353 profile=any'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="VIOCHEM"'
!macroend
