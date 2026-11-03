$porta = 8090
$baseDN = "LDAP://172.20.8.239/DC=dm-pluris,DC=plurismidia,DC=com,DC=br"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$porta/")
$listener.Start()
Write-Host "Consulta AD ouvindo na porta $porta"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $resp = $ctx.Response
    $resultado = @{ ok = $false }

    try {
        $login = $ctx.Request.QueryString["login"]

        # só aceita login em formato válido (evita injeção no filtro LDAP)
        if ($login -match '^[a-zA-Z0-9._-]{1,32}$') {
            $s = New-Object DirectoryServices.DirectorySearcher([ADSI]$baseDN)
            $s.Filter = "(&(objectCategory=person)(objectClass=user)(sAMAccountName=$login))"
            $s.PropertiesToLoad.Add("displayname") | Out-Null
            $r = $s.FindOne()
            if ($r -and $r.Properties["displayname"].Count -gt 0) {
                $resultado = @{ ok = $true; nome = [string]$r.Properties["displayname"][0] }
            }
        }
    } catch {
        $resultado = @{ ok = $false; erro = "falha na consulta" }
    }

    $json = $resultado | ConvertTo-Json -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $resp.ContentType = "application/json; charset=utf-8"
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.Close()
}