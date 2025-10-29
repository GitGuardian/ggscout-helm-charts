{{- define "ggscout.cronjob" -}}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "ggscout.fullname" . }}-{{ .cronjob_name }}
  labels:
    {{- include "ggscout.labels" . | nindent 4 }}
spec:
  schedule: {{ toJson .schedule  }}
  concurrencyPolicy: Replace
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: {{ .ttlSecondsAfterFinished | int }}
      backoffLimit: {{ .backOffLimit | int }}
      template:
        metadata:
          {{- with .Values.podAnnotations }}
          annotations: {{- toJson . }}
          {{- end }}
          labels:
            {{- include "ggscout.labels" . | nindent 12 }}
            {{- with .Values.podLabels }}
            {{ toYaml . | nindent 12 }}
            {{- end }}
        spec:
          {{- include "ggscout.securityContext" $ | indent 10 }}
          {{- if or $.Values.caBundle.certs $.Values.caBundle.existingSecret }}
          initContainers:
            - name: init-ca
              {{- include "ggscout.containerSecurityContext" . | indent 14 }}
              image: {{ include "ggscout.caBundle.image" . }}
              imagePullPolicy: {{ .Values.imagePullPolicy }}
              command: ["/bin/sh", "-c"]
              args:
                - |
                  set -x
                  cat $SSL_CERT_FILE >/etc/ssl/custom-certs/ca-bundle.crt

                  # Add private CA certificates bundle
                  if [[ -s /etc/ssl/ca-bundle/ca-bundle.crt ]]; then
                    cat /etc/ssl/ca-bundle/ca-bundle.crt >>/etc/ssl/custom-certs/ca-bundle.crt
                  fi
              volumeMounts:
                - name: ssl-custom-certs
                  mountPath: /etc/ssl/custom-certs
                - name: ssl-ca-bundle
                  mountPath: /etc/ssl/ca-bundle
                  readOnly: true
          {{- end }}
          containers:
            - name: {{ .Chart.Name }}
              image: {{ include "ggscout.image" . }}
              imagePullPolicy: {{ .Values.imagePullPolicy }}
              {{- include "ggscout.containerSecurityContext" $ | indent 14 }}
              args:
                - {{ .command }}
                {{- if .Values.inventory.log_level }}
                - --verbose={{ .Values.inventory.log_level }}
                {{- end}}
              resources: {{ toJson .Values.resources }}
              envFrom: {{ toJson .Values.envFrom }}
              env:
                - name: INVENTORY_CONFIG_PATH
                  value: /etc/inventory/config.yml
              {{- if or .Values.caBundle.certs .Values.caBundle.existingSecret }}
                - name: SSL_CERT_FILE
                  value: /etc/ssl/custom-certs/ca-bundle.crt
              {{- end }}
              {{- range .Values.env }}
                - {{ toJson . }}
              {{- end }}
              volumeMounts:
                - name: config
                  mountPath: /etc/inventory
                - name: ssl-custom-certs
                  mountPath: /etc/ssl/custom-certs
                  readOnly: true
                {{- range .Values.volumeMounts }}
                - {{ toJson . }}
                {{- end }}
          {{- include "ggscout.imagePullSecrets" . | indent 10 }}
          serviceAccountName: {{ include "ggscout.serviceAccountName" . }}
          {{- with .Values.nodeSelector }}
          nodeSelector: {{ toJson . }}
          {{- end }}
          {{- with .Values.affinity }}
          affinity: {{ toJson . }}
          {{- end }}
          {{- with .Values.tolerations }}
          tolerations: {{ toJson . }}
          {{- end }}
          restartPolicy: {{ .Values.restartPolicy }}

          volumes:
            - name: config
              secret:
                secretName: {{ include "ggscout.fullname" . }}
            - name: ssl-custom-certs
              emptyDir: {}
            {{- if or .Values.caBundle.certs .Values.caBundle.existingSecret }}
            - name: ssl-ca-bundle
              secret:
                {{- if .Values.caBundle.certs }}
                secretName: {{ printf "%s-ca-bundle" (include "ggscout.fullname" .) }}
                items:
                  - key: ca.crt
                    path: ca-bundle.crt
                {{- else }}
                secretName: {{ .Values.caBundle.existingSecret }}
                items:
                  - key: {{ default "ca.crt" .Values.caBundle.existingSecretKey }}
                    path: ca-bundle.crt
                {{- end }}
            {{- end }}
            {{- range .Values.volumes }}
            - {{ toJson . }}
            {{- end }}
{{- end -}}
