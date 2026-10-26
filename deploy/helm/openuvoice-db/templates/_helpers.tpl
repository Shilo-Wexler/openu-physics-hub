{{/*
Base name for everything that belongs to one database, e.g. "chat-db".
Called with one entry of .Values.databases.
*/}}
{{- define "openuvoice-db.name" -}}
{{- printf "%s-db" .name -}}
{{- end -}}

{{/*
Labels that never change for a database. Used as the StatefulSet selector and the
Service selector, which Kubernetes does not allow to change after creation.
Called with (dict "root" $ "db" <entry>).
*/}}
{{- define "openuvoice-db.selectorLabels" -}}
app.kubernetes.io/name: postgres
app.kubernetes.io/instance: {{ include "openuvoice-db.name" .db }}
{{- end -}}

{{/*
Full labels for every resource: the selector labels plus descriptive ones.
Called with (dict "root" $ "db" <entry>).
*/}}
{{- define "openuvoice-db.labels" -}}
{{ include "openuvoice-db.selectorLabels" . }}
app.kubernetes.io/part-of: openuvoice
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end -}}