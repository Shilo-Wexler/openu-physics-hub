{{/*
Env vars of a backend server: plain settings from server.env, then one <SETTING>_FILE per secret,
pointing at the mounted Secret. Shared by the Deployment and any Job or CronJob of that backend,
so they always run with the same settings.
Called with (dict "server" <backend>.server).
*/}}
{{- define "openuvoice.serverEnv" -}}
{{- range $name, $value := .server.env }}
- name: {{ $name }}
  value: {{ $value | quote }}
{{- end }}
{{- range $name, $key := .server.secretFiles }}
- name: {{ $name }}_FILE
  value: /run/secrets/app/{{ $key }}
{{- end }}
{{- end -}}

{{/*
Where the server's Secret and its scratch folder are mounted. Pairs with openuvoice.serverVolumes.
*/}}
{{- define "openuvoice.serverVolumeMounts" -}}
- name: secrets
  mountPath: /run/secrets/app
  readOnly: true
- name: tmp
  mountPath: /tmp
{{- end -}}

{{/*
The server's Secret as read-only files, and an empty /tmp (the root filesystem is read-only).
Called with (dict "server" <backend>.server).
*/}}
{{- define "openuvoice.serverVolumes" -}}
- name: secrets
  secret:
    secretName: {{ .server.secretName }}
    defaultMode: 0444
- name: tmp
  emptyDir: {}
{{- end -}}