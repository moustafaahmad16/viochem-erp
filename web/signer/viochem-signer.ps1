# VIOCHEM e-seal signer
#
# Signs e-invoices for the Egyptian Tax Authority with the e-seal USB token plugged into this computer.
# The VIOCHEM app in your browser sends each invoice here to be signed before it goes to the tax authority.
# Nothing leaves this computer except the signature, and only the VIOCHEM app may ask for one.
#
# Keep this window open while sending e-invoices. Windows asks for the token's PIN the first time.

$ErrorActionPreference = 'Stop'

# Settings. The download from the app fills in its own address.
$Port = 8765
$AllowedOrigins = @('__VIOCHEM_ORIGIN__')
# Part of the certificate issuer's name, if more than one certificate is found (e.g. 'Egypt Trust').
$IssuerFilter = ''
# Optional password for programs on this computer that call the signer without a browser.
$Token = ''

Add-Type -AssemblyName System.Security

function Get-SealCertificate {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My', 'CurrentUser')
    $store.Open('ReadOnly')
    $now = Get-Date
    $certs = @($store.Certificates | Where-Object {
        $_.HasPrivateKey -and $_.NotBefore -lt $now -and $_.NotAfter -gt $now -and
        ($IssuerFilter -eq '' -or $_.Issuer -like "*$IssuerFilter*")
    })
    $store.Close()
    $known = @($certs | Where-Object { $_.Issuer -match 'Egypt Trust|MCDR|Misr for Central Clearing|Fixed Mobile|e-finance|ITIDA' })
    if ($known.Count -gt 0) { $certs = $known }
    if ($certs.Count -eq 0) {
        throw 'No e-seal certificate found. Plug in the USB token, make sure its driver is installed, and start the signer again.'
    }
    return @($certs | Sort-Object NotAfter -Descending)[0]
}

# DER encoding, just enough for the signing-certificate attribute.
function Get-DerLength([int]$n) {
    if ($n -lt 128) { return ,[byte[]]@($n) }
    $bytes = @()
    while ($n -gt 0) { $bytes = @([byte]($n -band 0xFF)) + $bytes; $n = $n -shr 8 }
    return ,[byte[]](@([byte](0x80 + $bytes.Count)) + $bytes)
}

function Get-Der([byte]$tag, [byte[]]$content) {
    return ,[byte[]](@($tag) + (Get-DerLength $content.Length) + $content)
}

# SigningCertificateV2 (RFC 5035) holding the SHA-256 of the certificate, encoded the way the tax
# authority's own sample signer does it.
function Get-SigningCertificateV2($cert) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha.ComputeHash($cert.RawData)
    $oid = [byte[]](0x06, 0x0B, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x09, 0x10, 0x02, 0x2F)
    $algorithm = Get-Der 0x30 $oid
    $essCertId = Get-Der 0x30 ([byte[]]($algorithm + (Get-Der 0x04 $hash)))
    return ,(Get-Der 0x30 (Get-Der 0x30 $essCertId))
}

# A detached CAdES-BES signature of the document's serialized text, as ETA expects.
function New-Signature([string]$serialized, $cert) {
    $data = [System.Text.Encoding]::UTF8.GetBytes($serialized)
    $content = New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList (New-Object System.Security.Cryptography.Oid '1.2.840.113549.1.7.5'), $data
    $cms = New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $content, $true
    $signer = New-Object System.Security.Cryptography.Pkcs.CmsSigner -ArgumentList $cert
    $signer.DigestAlgorithm = New-Object System.Security.Cryptography.Oid '2.16.840.1.101.3.4.2.1'
    [void]$signer.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime -ArgumentList ([DateTime]::UtcNow)))
    [void]$signer.SignedAttributes.Add((New-Object System.Security.Cryptography.AsnEncodedData -ArgumentList '1.2.840.113549.1.9.16.2.47', (Get-SigningCertificateV2 $cert)))
    $cms.ComputeSignature($signer)
    return [Convert]::ToBase64String($cms.Encode())
}

function Send-Json($response, [int]$status, $body) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
    $response.StatusCode = $status
    $response.ContentType = 'application/json; charset=utf-8'
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

$cert = Get-SealCertificate
Write-Host ''
Write-Host 'VIOCHEM e-seal signer' -ForegroundColor Cyan
Write-Host "Certificate: $($cert.Subject)"
Write-Host "Issued by:   $($cert.Issuer)"
Write-Host "Valid until: $($cert.NotAfter.ToString('dd MMM yyyy'))"
Write-Host "Accepting:   $($AllowedOrigins -join ', ')"

# Sign once now so Windows asks for the PIN straight away rather than in the middle of sending.
[void](New-Signature 'VIOCHEM signer check' $cert)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Ready on http://localhost:$Port. Keep this window open while sending e-invoices." -ForegroundColor Green

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    try {
        $origin = $request.Headers['Origin']
        if ($origin) {
            if ($AllowedOrigins -notcontains $origin) {
                Write-Host "Refused a request from $origin" -ForegroundColor Yellow
                Send-Json $response 403 @{ error = 'This website may not use the e-seal.' }
                continue
            }
            $response.AddHeader('Access-Control-Allow-Origin', $origin)
            $response.AddHeader('Vary', 'Origin')
            $response.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            $response.AddHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            $response.AddHeader('Access-Control-Allow-Private-Network', 'true')
        } elseif ($Token -ne '' -and $request.Headers['Authorization'] -ne "Bearer $Token") {
            Send-Json $response 401 @{ error = 'Wrong signer password.' }
            continue
        }

        $path = $request.Url.AbsolutePath.TrimEnd('/')
        if ($request.HttpMethod -eq 'OPTIONS') {
            $response.StatusCode = 204
            $response.Close()
        } elseif ($request.HttpMethod -eq 'GET' -and $path -eq '/status') {
            Send-Json $response 200 @{ ok = $true; subject = $cert.Subject; issuer = $cert.Issuer; validUntil = $cert.NotAfter.ToString('yyyy-MM-dd') }
        } elseif ($request.HttpMethod -eq 'POST' -and $path -eq '/sign') {
            $reader = New-Object System.IO.StreamReader -ArgumentList $request.InputStream, ([System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            if (-not $body.serialized) { throw 'Nothing to sign.' }
            $signature = New-Signature ([string]$body.serialized) $cert
            Write-Host "$(Get-Date -Format 'HH:mm:ss') Signed $(if ($body.label) { $body.label } else { 'a document' })"
            Send-Json $response 200 @{ signature = $signature }
        } else {
            Send-Json $response 404 @{ error = 'Not found.' }
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        try { Send-Json $response 500 @{ error = $_.Exception.Message } } catch {}
    }
}
