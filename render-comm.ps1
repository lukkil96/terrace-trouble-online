# Renders the public/comm_*.wav commentary lines with Windows TTS (Hazel en-GB).
# Edit the SSML below and re-run to change the commentator's lines.
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Hazel Desktop')

$lines = @{
  intro  = '<prosody rate="+18%" pitch="+12%"><emphasis>Its</emphasis> all <emphasis>over</emphasis>!</prosody> <break time="120ms"/> <prosody rate="+22%" pitch="+18%">DORKING WANDERERS, <emphasis>ONE</emphasis>!</prosody> <break time="180ms"/> <prosody rate="+10%" pitch="+5%">The visitors?</prosody> <break time="150ms"/> <prosody rate="+15%" pitch="+20%"><emphasis>Absolutely NIL!</emphasis></prosody> <break time="160ms"/> <prosody rate="+22%" pitch="+22%">And Meadowbank is <emphasis>BOUNCING</emphasis>!</prosody>'
  kickoff= '<prosody rate="-10%" pitch="+25%">OHHHH!</prosody> <break time="100ms"/> <prosody rate="+20%" pitch="+15%">It has <emphasis>ALL</emphasis> kicked <emphasis>OFF</emphasis>!</prosody> <break time="150ms"/> <prosody rate="+18%" pitch="+18%">FIVE HUNDRED a side, on the halfway line!</prosody> <break time="170ms"/> <prosody rate="+8%" pitch="+10%">You simply <emphasis>cannot</emphasis> teach that!</prosody>'
  stag   = '<prosody rate="+5%" pitch="+10%">WAIT a minute!</prosody> <break time="150ms"/> <prosody rate="+20%" pitch="+18%">A giant <emphasis>PINK COCKEREL</emphasis> has nicked the match ball!</prosody> <break time="160ms"/> <prosody rate="+15%" pitch="+22%">On the loose at Meadowbank!</prosody> <break time="140ms"/> <prosody rate="+22%" pitch="+25%"><emphasis>SOMEBODY get hold of him!</emphasis></prosody>'
  win    = '<prosody rate="-15%" pitch="+20%">DOWN! <break time="120ms"/> GOES! <break time="120ms"/> THE COCKEREL!</prosody> <break time="180ms"/> <prosody rate="+18%" pitch="+15%">Absolutely <emphasis>flattened</emphasis>!</prosody> <break time="160ms"/> <prosody rate="+10%" pitch="+25%">SCENES! <break time="120ms"/> <emphasis>SCENES at Meadowbank!</emphasis></prosody>'
  gaffer = '<prosody rate="+5%" pitch="+8%">Oh dear, oh dear!</prosody> <break time="160ms"/> <prosody rate="+15%" pitch="+18%">The gaffer has <emphasis>LOST IT</emphasis> at Meadowbank!</prosody>'
  decked = '<prosody rate="+12%" pitch="+15%">Oh that is <emphasis>OUTRAGEOUS</emphasis>!</prosody> <break time="150ms"/> <prosody rate="-5%" pitch="+20%">The <emphasis>GAFFER</emphasis>!</prosody> <break time="130ms"/> <prosody rate="+15%" pitch="+18%">Has been <emphasis>DECKED</emphasis> at Meadowbank!</prosody>'
}

$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach($k in $lines.Keys){
  $out = Join-Path $PSScriptRoot ("public\comm_" + $k + ".wav")
  $synth.SetOutputToWaveFile($out, $fmt)
  $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">' + $lines[$k] + '</speak>'
  $synth.SpeakSsml($ssml)
  $synth.SetOutputToNull()
  Write-Output ("rendered " + $k)
}
$synth.Dispose()
Get-ChildItem (Join-Path $PSScriptRoot 'public\comm_*.wav') | ForEach-Object { "$($_.Name) $([math]::Round($_.Length/1KB))KB" }
