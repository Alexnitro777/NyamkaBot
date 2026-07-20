Заявка на привилегированный intent Server Members для приложения FemVerify-BOT

Перед отправкой замените указания вида «ССЫЛКА: ...» на действительные ссылки на скриншоты или видеоролики. Материалы необходимо подготовить и разместить самостоятельно (например, Imgur, YouTube, Streamable или прямые ссылки на вложения), после чего указать соответствующие адреса.


Вопрос 1. Что делает ваше приложение?

Русская версия.

FemVerify-BOT представляет собой мультисерверного бота верификации участников для платформы Discord, разработанного на discord.js версии 14 и языке TypeScript. Один процесс обслуживает все серверы, на которых устано��лено приложение. Роли, каналы и категории каждого сервера настраиваются независимо и хранятся в базе данных. Пользовательский интерфейс выполнен на русском языке.

Приложение выполняет следующие функции.

Верификация участников. Участник нажимает кнопку начала верификации и заполняет форму из пяти вопросов. Перед открытием формы приложение проверяет, не находится ли пользователь в чёрном списке, не имеет ли активной заявки и не прошёл ли верификацию ранее. Заполненная заявка публикуется в канал модерации в виде сообщения, содержащего сведения об участнике, дате создания учётной записи, дате входа на сервер и способе вступления, а также четыре кнопки решения. Модератор может принять заявку с выдачей роли верифицированного участника и отправкой личного сообщения, отклонить её с указанием причины, открыть приватный канал для уточняющих вопросов либо внести участника в чёрный список со снятием всех ролей, выдачей роли чёрного списка и предоставлением ссылки на апелляцию. Итоговые решения обрабатываются атомарно и защищены от повторной обработки.

Апелляции. Участники, внесённые в чёрный список, могут подать апелляцию. Апелляция публикуется в отдельный канал модерации с тремя кнопками: принять апелляцию со снятием роли чёрного списка и восстановлением ранее снятых ролей, отказать с установлением ограничения на повторную подачу в течение сорока восьми часов либо открыть приватный канал для уточняющих вопросов.

Автоматическая выдача роли за тег сервера. Приложение автоматически выдаёт настроенную роль участнику, установившему тег данного сервера, и снимает её при удалении тега. Обработка выполняется при входе участника, при обновлении сведений об участнике или пользователе, а также при получении соответствующих служебных пакетов. При запуске приложение синхронизирует роли по всем участникам сервера.

Приватные каналы для вопросов. Приложение создаёт приватные текстовые каналы для уточняющих вопросов между участником и модерацией. Каналы закрываются вручную либо удаляются автоматически по истечении двадцати четырёх часов.

Определение способа вступления. При входе участника приложение определяет, по какому приглашению он присоединился к серверу, и отображает эти сведения в заявке.

Команды приложения. Предусмотрены команды для размещения кнопок верификации и апелляции, вывода списков необработанных заявок и апелляций, отображения статистики по тегу сервера, а также для добавления и снятия роли чёрного списка вручную.

Фоновые задачи. Приложение автоматически переводит заявки старше сорока восьми часов в статус истёкших, удаляет приватные каналы вопросов старше двадцати четырёх часов и помечает необработанные заявки и апелляции как закрытые при выходе участника с сервера.

Данные хранятся во внешней базе данных MySQL или MariaDB. Приложение обрабатывает данные только тех участников серверов, на которые оно приглашено, и не собирает сведения сверх предоставленных пользователем в заявке.

Примеры. Форма верификации: ССЫЛКА: скриншот формы верификации. Карточка модерации с четырьмя кнопками: ССЫЛКА: скриншот карточки модерации. Процесс принятия и отклонения заявки: ССЫЛКА: видеоролик или скриншот решения модератора. Форма и обработка апелляции: ССЫЛКА: скриншот апелляции. Автоматическая выдача роли за тег сервера: ССЫЛКА: скриншот журнала тега. Приватный канал для вопросов: ССЫЛКА: скриншот канала вопросов.

Английская версия для размещения в форме.

FemVerify-BOT is a multi-server member-verification application for Discord, developed with discord.js version 14 and TypeScript. A single process serves every server on which the application is installed. Each server configures its own roles, channels, and categories independently, and this data is stored in a database. The user interface is in Russian.

The application provides the following functions.

Member verification. A member clicks a verification button and completes a five-question form. Before the form opens, the application verifies that the user is not blacklisted, has no pending application, and has not already been verified. The completed application is posted to a moderation channel as a message containing the member, the account-creation date, the server-join date, and the join method, together with four decision buttons. A moderator may approve the application, granting the verified role and sending a direct message; reject it with a stated reason; open a private channel for clarifying questions; or blacklist the member, removing all roles, granting the blacklist role, and providing an appeal link. Final decisions are processed atomically and protected against double processing.

Appeals. Blacklisted members may submit an appeal. The appeal is posted to a separate moderation channel with three buttons: accept the appeal, removing the blacklist role and restoring the previously removed roles; deny it, applying a forty-eight-hour cooldown; or open a private channel for clarifying questions.

Automatic Server Tag role. The application automatically grants a configured role to members who display this server's Server Tag and removes it when the tag is dropped. Processing occurs on member join, on member or user updates, and on receipt of the corresponding gateway packets. On startup, the application synchronizes the role across all members of the server.

Private question channels. The application creates private text channels for clarifying questions between the applicant and the moderators. These channels are closed manually or deleted automatically after twenty-four hours.

Join-method tracking. On member join, the application determines which invite the member used to join the server and displays this information in the application.

Application commands. Commands are provided for posting verification and appeal buttons, listing pending applications and appeals, displaying Server Tag statistics, and manually adding or removing the blacklist role.

Background tasks. The application automatically marks applications older than forty-eight hours as expired, deletes question channels older than twenty-four hours, and marks pending applications and appeals as closed when a member leaves the server.

Data is stored in an external MySQL or MariaDB database. The application processes only the members of servers to which it has been invited and does not collect member data beyond what a user submits in an application.

Examples. Verification form: LINK: verification form screenshot. Moderation card with four decision buttons: LINK: moderation card screenshot. Approval and rejection flow: LINK: moderator decision video or screenshot. Appeal form and handling: LINK: appeal screenshot. Automatic Server Tag role: LINK: tag log screenshot. Private question channel: LINK: question channel screenshot.


Вопрос 2. Для чего вам нужен Guild Members intent?

Русская версия.

Server Members Intent необходим приложению для четырёх функций, без которых оно не может работать.

Во-первых, событие входа участника требуется для того, чтобы зафиксировать присоединение нового участника, запустить процесс верификации и выдать роль за тег сервера.

Во-вторых, событие обновления участника и связанные с ним обновления требуются для определения момента, когда участник устанавливает или удаляет тег сервера, с целью автоматической выдачи или снятия соответствующей роли.

В-третьих, событие выхода участника требуется для того, чтобы при выходе участника пометить его необработанную заявку или апелляцию как закрытую и удалить связанные приватные каналы вопросов.

В-четвёртых, получение полного списка участников требуется при запуске приложения для синхронизации ролей за тег сервера по всем участникам и для подсчёта статистики по тегу.

Без привилегированного Server Members Intent платформа Discord не передаёт события участников и не позволяет получить полный список участников, вследствие чего перечисленные функции прекращают работать.

Английская версия для размещения в форме.

The application requires the Server Members Intent for four functions without which it cannot operate.

First, the member-join event is required to register that a new member has joined, to start the verification process, and to grant the Server Tag role.

Second, the member-update event and related updates are required to determine when a member adds or removes the Server Tag, so that the corresponding role can be granted or removed automatically.

Third, the member-leave event is required to mark a leaving member's pending application or appeal as closed and to remove the associated private question channels.

Fourth, fetching the full member list is required on startup in order to synchronize Server Tag roles across all members and to compute Server Tag statistics.

Without the privileged Server Members Intent, Discord does not deliver member events and does not permit fetching the full member list, and the functions listed above therefore cease to work.
