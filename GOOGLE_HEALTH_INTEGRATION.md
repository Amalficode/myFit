# MyFit × Fitbit Air — подключение Google Health

Статус: **не подключено автоматически**. Fitbit Air уже синхронизирован с Google Health на iPhone. MyFit 1.8 пока принимает дневные данные вручную и импортом CSV/JSON.

## Что необходимо для автоматической интеграции

1. В Google Health на iPhone убедиться, что выбран нужный Google-аккаунт и данные Fitbit Air приходят в его профиль.
2. В [Google Cloud Console](https://console.cloud.google.com/) создать отдельный **тестовый** проект, например `MyFit Personal Test`.
3. [Включить Google Health API и создать OAuth 2.0 Client](https://developers.google.com/health/setup). Клиент веб-приложения должен использовать **фактический HTTPS callback URL будущего backend**. Не использовать секреты на GitHub Pages.
4. OAuth consent screen: `External` + `Testing`; добавить Google-аккаунт владельца к `Test users`.
5. Только необходимые права чтения:
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` (шаги, активные минуты, пульс);
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly` (сон);
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` (HRV / пульс покоя, если доступны).
   Полный список и доступность метрик проверить: https://developers.google.com/health/scopes и https://developers.google.com/health/data-types/device-compatibility.
6. Развернуть **приватный backend** (например, Google Cloud Run): OAuth authorization-code flow с проверкой `state`, HTTPS callback, серверный обмен кода на токены, шифрованное хранение refresh token, запрет CORS от посторонних доменов и закрытый доступ к пользовательским данным.
7. После выдачи разрешения проверить связь профиля через `GET https://health.googleapis.com/v4/users/me/identity`. Пока это не проверено, не показывать «Подключено».
8. Организовать синхронизацию фактических данных, учитывая часовой пояс; агрегировать шаги через `dataPoints:dailyRollUp`. Преобразовать итог в записи `date,steps,sleepHours,restingHr,activeMinutes,hrv`.
9. Отдельно определить, как недельные данные станут доступны **автоматической задаче ChatGPT**. Приложение GitHub Pages хранит журнал тренировок локально в Safari и само по себе не делает его доступным чат-автоматизации. Не публиковать экспорт здоровья в открытом GitHub.
10. После проверки отзывов и безопасности создать production проект, если приложение будет использоваться другими людьми.

## Безопасность и приватность

- **Никогда не пересылать в чат, коммит, скриншоты или GitHub** `client_secret`, OAuth `authorization_code`, access/refresh tokens и Credentials JSON.
- GitHub Pages — статический хостинг. Он **не** является безопасным сервером хранения токенов.
- Для персонального теста использовать Test users; при коммерческом запуске потребуется пройти правила Google по restricted scopes, OAuth verification и, где применимо, security assessment.
- Не смешивать медицинские данные с публичным репозиторием или публичными GitHub Actions logs.

## Текущий обходной путь

MyFit 1.8 → вкладка «Отчёт» → «Fitbit Air — показатели по дням». Можно записывать показатели вручную или загружать подготовленный CSV / JSON, скачивать отчёт и делиться им с ChatGPT. Автоматический недельный отчёт ChatGPT по понедельникам создан, но не имеет самостоятельного доступа к локальным данным Safari.

## Официальные источники

- https://developers.google.com/health/setup
- https://developers.google.com/health/about
- https://developers.google.com/health/scopes
- https://developers.google.com/health/data-types/device-compatibility
- https://developers.google.com/health/data-types/steps
