{{/*
Full image reference for one of our images, e.g. "chat-migrate:ab1e70d".
Fails the render when image.tag is missing, so an unknown version is never installed.
Called with (dict "root" $ "name" "chat-migrate").
*/}}
{{- define "openuvoice.image" -}}
{{- $tag := required "Set image.tag, e.g. --set-string image.tag=$(git rev-parse --short HEAD)" .root.Values.image.tag -}}
{{- printf "%s%s:%s" .root.Values.image.registry .name $tag -}}
{{- end -}}

{{/*
Labels that never change for a component. Used in selectors, which cannot change after creation.
Called with (dict "root" $ "component" "chat-backend").
*/}}
{{- define "openuvoice.selectorLabels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}

{{/*
Full labels for every resource.
Called with (dict "root" $ "component" "chat-backend").
*/}}
{{- define "openuvoice.labels" -}}
{{ include "openuvoice.selectorLabels" . }}
app.kubernetes.io/part-of: openuvoice
app.kubernetes.io/version: {{ .root.Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end -}}

{{/*
Pod-level security shared by every pod of the app. Each image sets its own non-root USER.
*/}}
{{- define "openuvoice.podSecurityContext" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{/*
Container-level security shared by every container of the app.
*/}}
{{- define "openuvoice.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{/*
The Secret that lets every pod pull our private images (from GHCR). Renders nothing when
image.pullSecret is empty (images that need no login).
Called with the root context, inside a pod spec.
*/}}
{{- define "openuvoice.imagePullSecrets" -}}
{{- with .Values.image.pullSecret }}
imagePullSecrets:
  - name: {{ . }}
{{- end }}
{{- end -}}