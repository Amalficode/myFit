# MyFit × Google Health — защищённая синхронизация

Статус: **серверный код подготовлен, но ещё не развёрнут в Google Cloud**. Показатели в MyFit 1.9 продолжают храниться локально в браузере. Сервер после развёртывания добавляет автоматическое обновление при открытии приложения; он не передаёт данные в ChatGPT автоматически.

## Перед началом

- Google Cloud Project: `myfit-health-test` (уже создан пользователем).
- Google Health API включён, OAuth Web client уже создан, нужные read-only scopes уже добавлены.
- У Google Cloud проекта должен быть **подключён Billing** для Cloud Run/Firestore/Secret Manager. Возможны расходы даже в пределах бесплатных квот. **Не подключайте Billing без осознанного решения.** В Billing → Budgets & alerts настройте бюджет и уведомления (уведомление само по себе не ограничивает траты).
- Никогда не копируйте OAuth Client Secret, содержимое Credentials JSON, Google access/refresh tokens или ключ MyFit в GitHub, чат, публичный Google Drive, скриншоты или исходный код.

## Что делает решение

1. Google OAuth 2.0 redirect открывается только по кнопке, запрос подписывается случайным одноразовым `state`.
2. На сервере Google refresh token хранится **зашифрованным** в Firestore (AES-256-GCM), ключ хранится в Secret Manager.
3. MyFit получает только дневные итоги шагов, сна, пульса покоя и HRV; исходные токены остаются на сервере.
4. При каждом открытии MyFit делает проверку `/api/status` и `/api/daily`. Если синхронизации не было более 6 часов, сервер обращается к Google Health заново (за последние ~16 дней).
5. При истечении Google OAuth Testing refresh token (через 7 дней) MyFit показывает предупреждение о повторной авторизации. Это **не** постоянная фоновая синхронизация, когда приложение полностью закрыто.

## 1. Firestore в Google Cloud Console

В проекте `MyFit-Health-Test` откройте [Firestore](https://console.cloud.google.com/firestore), нажмите **Create Database**. Выберите **Standard edition**, **Native mode**, database ID `(default)`, регион `europe-west4` (если доступен), security rules **Restrictive**. Если база уже существует — вторую default не создавать.

## 2. Создать секреты

Откройте [Secret Manager](https://console.cloud.google.com/security/secret-manager) в своём Google-проекте.

- `myfit-google-client-secret` — вставьте значение `client_secret` из вашего локального JSON (не весь JSON).
- Для двух остальных секретов используйте **Google Cloud Shell**, чтобы ключи не попадали в историю команд как значения:

```bash
gcloud config set project myfit-health-test
openssl rand -hex 32 | gcloud secrets create myfit-api-key --replication-policy=automatic --data-file=-
openssl rand -hex 32 | gcloud secrets create myfit-encryption-key --replication-policy=automatic --data-file=-
```

Если секреты уже существуют, создавать их повторно не нужно. Секреты (`client_secret`, `myfit-api-key`, `myfit-encryption-key`) нельзя публиковать.

## 3. Сервисный аккаунт и доступ

В Google Cloud Shell:

```bash
export PROJECT_ID=myfit-health-test
export SA=myfit-health-bridge@${PROJECT_ID}.iam.gserviceaccount.com
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com
gcloud iam service-accounts create myfit-health-bridge --display-name='MyFit Health Bridge' || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role='roles/datastore.user'
for SECRET in myfit-google-client-secret myfit-api-key myfit-encryption-key; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$SA" --role='roles/secretmanager.secretAccessor'
done
```

Аккаунту не нужен доступ Owner или Editor.

## 4. Развернуть сервер из GitHub

Скопируйте актуальную версию из GitHub в Google Cloud Shell:

```bash
git clone https://github.com/Amalficode/myFit.git
cd myFit
```

В Google Auth Platform → Clients → **MyFit Health Test** скопируйте **OAuth Client ID** (не secret). В Google Cloud Shell подставьте его локально вместо `PASTE_CLIENT_ID_HERE`:

```bash
export GOOGLE_CLIENT_ID='PASTE_CLIENT_ID_HERE'
gcloud run deploy myfit-health-bridge --source ./health-bridge \
  --region=europe-west4 --allow-unauthenticated \
  --service-account="$SA" --min-instances=0 --max-instances=1 \
  --set-env-vars="GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" \
  --set-secrets='GOOGLE_CLIENT_SECRET=myfit-google-client-secret:1,MYFIT_API_KEY=myfit-api-key:1,MYFIT_ENCRYPTION_KEY=myfit-encryption-key:1'
```

Команда использует Cloud Build/Artifact Registry и может потребовать дополнительных разрешений для build service account; ориентируйтесь на сообщение Google, не предоставляйте Owner всем участникам автоматически.

Google покажет **Service URL**, например `https://myfit-health-bridge-xxxxx-ew.a.run.app`. Скопируйте свой реальный адрес. В Cloud Shell:

```bash
export SERVICE_URL=$(gcloud run services describe myfit-health-bridge --region=europe-west4 --format='value(status.url)')
gcloud run services update myfit-health-bridge --region=europe-west4 \
  --update-env-vars="MYFIT_BRIDGE_URL=$SERVICE_URL"
```

Проверьте `${SERVICE_URL}/health` в браузере — должно быть `{"ok":true,"configured":true}`.

## 5. Вернуться в Google OAuth client

В Google Auth Platform → Clients → MyFit Health Test → **Authorized redirect URIs** добавьте точный адрес:

`<ваш SERVICE_URL>/oauth/callback`

Не путайте с Authorized JavaScript origins. Сохраните изменения. Адрес Playground можно оставить для тестов, однако для реальной синхронизации нужен **новый callback Cloud Run**.

## 6. Подключить из MyFit на iPhone

1. На компьютере в Cloud Shell **только для себя** покажите личный API key:
   `gcloud secrets versions access latest --secret=myfit-api-key`
2. Откройте MyFit на **том же iPhone**, где записаны тренировки. Вкладка **Отчёт → Fitbit Air — автосинхронизация**.
3. Введите `SERVICE_URL` и личный `myfit-api-key` (не Client Secret), нажмите «Сохранить настройки».
4. Нажмите «Подключить Google», войдите в свой аккаунт и подтвердите три разрешения.
5. Вернувшись в MyFit, нажмите «Синхронизировать». Смотрите статус последней загрузки, данные появятся в недельном отчёте.
6. Записи старых тренировок, вес и уже загруженные шаги сохраняются. Не удаляйте данные сайта в Safari.

**Безопасность:** личный API key хранится только в локальном хранилище Safari. Для личного приложения это компромисс: при доступе посторонних к незаблокированному телефону или XSS ключ может быть раскрыт. Для коммерческого приложения потребуется полноценная аутентификация пользователей и безопасное хранение сессий, а не один общий API key.

## 7. Что пока не автоматизировано

- Google OAuth **Testing**: refresh token действует 7 дней. После этого потребуется повторная авторизация либо отдельная публикация/верификация, соответствующая правилам Google Health и restricted scopes.
- Когда телефон закрыт, сервер не выполняет регулярные фоновые запросы. Для этого позже можно настроить Cloud Scheduler и отдельную защищённую служебную точку входа, используя Cloud IAM, **не размещая API key в Scheduler URL**.
- Автоматическая задача ChatGPT по понедельникам **не видит данные Safari и Cloud Run без специального защищённого интеграционного канала**. Пока недельный отчёт необходимо экспортировать из MyFit и передать в ChatGPT для полноценного анализа.
- Для коммерческой продажи MyFit понадобится multi-user architecture, Google verification/security review, privacy policy и разрешения пользователей.

## Документация

- [Google Health — Setup](https://developers.google.com/health/setup)
- [Google Health — Daily rollups](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp)
- [Google Health — List dataPoints](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list)
- [Google Cloud Run — Deploy from source](https://cloud.google.com/run/docs/deploying-source-code)
- [Cloud Run — Secret Manager](https://cloud.google.com/run/docs/configuring/services/secrets)