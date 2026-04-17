import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YouPiter BI — API Документация",
  description: "Документация для партнёрской интеграции с YouPiter BI",
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://your-domain.com";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const API_BASE = `${BASE_URL}${BASE_PATH}/api/v1`;

export default function ApiDocsPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0F1117", minHeight: "100vh", color: "#E2E8F0" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1E2433", background: "#0F1117", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              🚖
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>YouPiter BI</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Partner API v1</div>
            </div>
          </div>
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 600 }}>
            v1 · Stable
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "40px 24px", display: "flex", gap: 48 }}>

        {/* Sidebar nav */}
        <nav style={{ width: 200, flexShrink: 0, position: "sticky", top: 72, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
          <NavGroup label="Общее">
            <NavLink href="#what-is-this">Что это и зачем</NavLink>
            <NavLink href="#how-it-works">Как работает</NavLink>
            <NavLink href="#quickstart">Быстрый старт</NavLink>
            <NavLink href="#auth">Аутентификация</NavLink>
          </NavGroup>
          <NavGroup label="Базовые">
            <NavLink href="#ingest-shifts">Смены</NavLink>
            <NavLink href="#ingest-revenue">Выручка</NavLink>
            <NavLink href="#ingest-drivers">Водители</NavLink>
            <NavLink href="#ingest-cars">Машины</NavLink>
            <NavLink href="#ingest-events">События</NavLink>
          </NavGroup>
          <NavGroup label="Финансы и операции">
            <NavLink href="#ingest-trips">Поездки</NavLink>
            <NavLink href="#ingest-driver-balance">Баланс водителя</NavLink>
            <NavLink href="#ingest-driver-transactions">Транзакции водителей</NavLink>
            <NavLink href="#ingest-car-transactions">Транзакции авто</NavLink>
            <NavLink href="#ingest-payouts">Выплаты</NavLink>
            <NavLink href="#ingest-penalties">Штрафы</NavLink>
            <NavLink href="#ingest-rentals">Аренда авто</NavLink>
            <NavLink href="#ingest-shift-details">Детали смен</NavLink>
            <NavLink href="#ingest-hire-funnel">Воронка найма</NavLink>
          </NavGroup>
          <NavGroup label="Справочники">
            <NavLink href="#ingest-cabinets">Кабинеты агрегаторов</NavLink>
            <NavLink href="#ingest-tx-types">Типы транзакций</NavLink>
            <NavLink href="#ingest-payout-settings">Настройки выплат</NavLink>
          </NavGroup>
          <NavGroup label="Прочее">
            <NavLink href="#errors">Ошибки и коды</NavLink>
            <NavLink href="#faq">FAQ</NavLink>
          </NavGroup>
        </nav>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0 }}>

          {/* ── Что это ───────────────────────────────────────────────── */}
          <section id="what-is-this" style={{ marginBottom: 56 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>
              Документация API
            </h1>
            <p style={{ fontSize: 14, color: "#64748B", margin: "0 0 28px" }}>
              Для разработчиков, которые хотят отправлять данные в дашборд YouPiter BI
            </p>
            <SectionTitle>Что это и зачем</SectionTitle>
            <div style={{ padding: "20px 24px", borderRadius: 14, background: "#131929", border: "1px solid #2D3A55", marginBottom: 20 }}>
              <p style={{ color: "#CBD5E1", lineHeight: 1.8, margin: "0 0 12px", fontSize: 14 }}>
                <strong style={{ color: "#fff" }}>YouPiter BI</strong> — дашборд для управления таксопарком: смены, выручка, водители, автопарк, штрафы, выплаты, аналитика.
              </p>
              <p style={{ color: "#CBD5E1", lineHeight: 1.8, margin: "0 0 12px", fontSize: 14 }}>
                Данные поступают из ваших систем — TaxiCRM, 1С, Атимо, собственной CRM.
                <strong style={{ color: "#F59E0B" }}> Этот API позволяет любой вашей системе отправлять данные к нам.</strong>
              </p>
              <p style={{ color: "#94A3B8", lineHeight: 1.8, margin: 0, fontSize: 14 }}>
                Вы отправляете POST-запрос с массивом записей — мы принимаем, сохраняем и сразу отображаем в нужных разделах дашборда.
              </p>
            </div>
            <InfoBox color="#10B981" icon="💡">
              <strong style={{ color: "#E2E8F0" }}>Для нетехнических читателей:</strong> представьте дашборд как экран на стене в офисе.
              API — это провод, по которому ваша система отправляет цифры на этот экран.
              Настраиваете один раз — данные обновляются автоматически.
            </InfoBox>
          </section>

          {/* ── Как работает ─────────────────────────────────────────── */}
          <section id="how-it-works" style={{ marginBottom: 56 }}>
            <SectionTitle>Как это работает</SectionTitle>

            <div style={{ background: "#0D1117", border: "1px solid #2D3A55", borderRadius: 14, padding: "28px 24px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap", rowGap: 20 }}>
                <div style={{ textAlign: "center", minWidth: 140 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 10px" }}>🖥️</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#E2E8F0" }}>Ваша система</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>TaxiCRM / Атимо / 1С<br/>или любой сервис</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px" }}>
                  <div style={{ fontSize: 11, color: "#F59E0B", fontFamily: "monospace", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "4px 10px", marginBottom: 8, whiteSpace: "nowrap" }}>POST /api/v1/ingest/*</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 80, height: 2, background: "linear-gradient(90deg, #6366F1, #F59E0B)" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #F59E0B" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 8, textAlign: "center" }}>JSON с данными<br/>+ API-ключ в заголовке</div>
                </div>
                <div style={{ textAlign: "center", minWidth: 120 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 10px" }}>⚡</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#E2E8F0" }}>YouPiter API</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Проверяет ключ<br/>Сохраняет данные</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px" }}>
                  <div style={{ fontSize: 11, color: "#10B981", fontFamily: "monospace", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, padding: "4px 10px", marginBottom: 8 }}>{"{ ok: true }"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 80, height: 2, background: "linear-gradient(90deg, #F59E0B, #10B981)" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #10B981" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 8, textAlign: "center" }}>Данные в дашборде</div>
                </div>
                <div style={{ textAlign: "center", minWidth: 140 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 10px" }}>📊</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#E2E8F0" }}>YouPiter BI</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Данные видны<br/>во всех разделах</div>
                </div>
              </div>
            </div>

            {/* Сетка эндпоинтов по группам */}
            <EndpointGrid />
          </section>

          {/* ── Быстрый старт ────────────────────────────────────────── */}
          <section id="quickstart" style={{ marginBottom: 56 }}>
            <SectionTitle>Быстрый старт — 3 шага</SectionTitle>
            {[
              {
                num: "1", title: "Получите API-ключ", color: "#6366F1",
                content: (
                  <p style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                    Попросите администратора создать ключ в разделе
                    <strong style={{ color: "#E2E8F0" }}> Настройки → API-ключи</strong>. При создании выберите нужные разрешения (permissions).
                    Ключ выглядит так: <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>yk_live_a1b2c3d4e5f6...</code><br />
                    <span style={{ color: "#EF4444" }}>⚠ Ключ показывается только один раз — сохраните сразу.</span>
                  </p>
                ),
              },
              {
                num: "2", title: "Сделайте тестовый запрос", color: "#F59E0B",
                content: (
                  <>
                    <p style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.7, margin: "0 0 10px" }}>
                      Отправьте тестовый запрос — например, одну смену водителя:
                    </p>
                    <CodeBlock>{`curl -X POST ${API_BASE}/ingest/shifts \\
  -H "X-API-Key: yk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [{
      "date":      "2026-04-17",
      "driver_id": "test-001",
      "hours":     8,
      "revenue":   12000
    }]
  }'`}</CodeBlock>
                    <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>
                      Ожидаемый ответ: <code style={{ color: "#10B981", fontFamily: "monospace" }}>{`{"ok":true,"data":{"received":1,"inserted":1}}`}</code>
                    </p>
                  </>
                ),
              },
              {
                num: "3", title: "Настройте регулярную отправку", color: "#10B981",
                content: (
                  <p style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                    Настройте в вашей системе cron-задачу или webhook: отправляйте данные раз в час или раз в день.
                    Все эндпоинты поддерживают upsert — повторная отправка одних и тех же записей безопасна, дублей не будет.
                  </p>
                ),
              },
            ].map((step) => (
              <div key={step.num} style={{ display: "flex", gap: 20, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: step.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff", flexShrink: 0, marginTop: 2 }}>{step.num}</div>
                <div style={{ flex: 1, background: "#131929", borderRadius: 14, padding: "18px 20px", border: "1px solid #1E2433" }}>
                  <p style={{ fontWeight: 700, color: "#E2E8F0", fontSize: 15, margin: "0 0 10px" }}>{step.title}</p>
                  {step.content}
                </div>
              </div>
            ))}
          </section>

          {/* ── Auth ─────────────────────────────────────────────────── */}
          <section id="auth" style={{ marginBottom: 56 }}>
            <SectionTitle>Аутентификация</SectionTitle>
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Каждый запрос должен содержать API-ключ. Два способа передачи — любой на выбор:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div style={{ padding: "16px 18px", borderRadius: 12, background: "#131929", border: "1px solid rgba(16,185,129,0.3)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 8, textTransform: "uppercase" }}>Способ 1 — X-API-Key</div>
                <code style={{ fontSize: 12, color: "#94A3B8", fontFamily: "monospace", lineHeight: 1.8, display: "block" }}>
                  X-API-Key: yk_live_xxx...
                </code>
              </div>
              <div style={{ padding: "16px 18px", borderRadius: 12, background: "#131929", border: "1px solid rgba(99,102,241,0.3)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", marginBottom: 8, textTransform: "uppercase" }}>Способ 2 — Bearer</div>
                <code style={{ fontSize: 12, color: "#94A3B8", fontFamily: "monospace", lineHeight: 1.8, display: "block" }}>
                  Authorization: Bearer yk_live_xxx...
                </code>
              </div>
            </div>
            <InfoBox color="#EF4444" icon="🔐">
              Ключ привязан к разрешениям (permissions). Если ключ не имеет нужного разрешения — вернётся <code style={{ color: "#EF4444", fontFamily: "monospace" }}>403 Forbidden</code>. Разрешения задаются при создании ключа и видны в <strong style={{ color: "#E2E8F0" }}>Настройки → API-ключи</strong>.
            </InfoBox>
          </section>

          {/* ═══════════════════════════════════════════════════════════
              БАЗОВЫЕ ЭНДПОИНТЫ
          ════════════════════════════════════════════════════════════ */}
          <GroupHeader>Базовые эндпоинты</GroupHeader>

          <EndpointSection id="ingest-shifts" title="Смены">
            <EndpointBadge method="POST" path="/ingest/shifts" permission="ingest:shifts" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Рабочие смены водителей. Отображается в разделе <strong style={{ color: "#E2E8F0" }}>Операции → Смены</strong>.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>date + driver_id</code>.
            </p>
            <FieldTable fields={[
              { name: "date",      type: "string",  req: true,  desc: "Дата смены YYYY-MM-DD" },
              { name: "driver_id", type: "string",  req: true,  desc: "ID водителя в вашей системе" },
              { name: "car_plate", type: "string",  req: false, desc: "Госномер авто" },
              { name: "park_code", type: "string",  req: false, desc: "Код парка" },
              { name: "hours",     type: "number",  req: false, desc: "Длительность смены (часов)" },
              { name: "revenue",   type: "number",  req: false, desc: "Выручка за смену (руб.)" },
              { name: "source",    type: "string",  req: false, desc: 'Источник данных, напр. "taxicrm"' },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-revenue" title="Выручка">
            <EndpointBadge method="POST" path="/ingest/revenue" permission="ingest:revenue" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Дневная выручка по паркам. Отображается в <strong style={{ color: "#E2E8F0" }}>Операции → Выручка</strong>.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>date + park_code</code>.
            </p>
            <FieldTable fields={[
              { name: "date",      type: "string", req: true,  desc: "Дата YYYY-MM-DD" },
              { name: "park_code", type: "string", req: true,  desc: "Код парка" },
              { name: "amount",    type: "number", req: false, desc: "Выручка (руб.)" },
              { name: "rides",     type: "number", req: false, desc: "Количество поездок" },
              { name: "source",    type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-drivers" title="Водители">
            <EndpointBadge method="POST" path="/ingest/drivers" permission="ingest:drivers" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Список водителей. Отображается в <strong style={{ color: "#E2E8F0" }}>Операции → Водители</strong>.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id (taxicrm_id)</code>.
            </p>
            <FieldTable fields={[
              { name: "external_id", type: "string", req: true,  desc: "ID водителя в вашей системе" },
              { name: "name",        type: "string", req: false, desc: "ФИО водителя" },
              { name: "phone",       type: "string", req: false, desc: "Телефон" },
              { name: "park_code",   type: "string", req: false, desc: "Код парка" },
              { name: "status",      type: "string", req: false, desc: "Статус: active / inactive / blocked" },
              { name: "license",     type: "string", req: false, desc: "Серия и номер ВУ" },
              { name: "hired_at",    type: "string", req: false, desc: "Дата приёма YYYY-MM-DD" },
              { name: "source",      type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-cars" title="Машины">
            <EndpointBadge method="POST" path="/ingest/cars" permission="ingest:cars" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Автопарк. Отображается в <strong style={{ color: "#E2E8F0" }}>Операции → Автопарк</strong>.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>plate (госномер)</code>.
            </p>
            <FieldTable fields={[
              { name: "plate",       type: "string", req: true,  desc: "Госномер (уникальный ключ)" },
              { name: "model",       type: "string", req: false, desc: "Марка и модель" },
              { name: "year",        type: "number", req: false, desc: "Год выпуска" },
              { name: "park_code",   type: "string", req: false, desc: "Код парка" },
              { name: "status",      type: "string", req: false, desc: "Статус: active / repair / archive и т.д." },
              { name: "external_id", type: "string", req: false, desc: "ID авто в вашей системе" },
              { name: "source",      type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-events" title="События">
            <EndpointBadge method="POST" path="/ingest/events" permission="ingest:events" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Произвольные события (ТО, ремонт, происшествия). Отображается в <strong style={{ color: "#E2E8F0" }}>СТО и других разделах</strong>.
            </p>
            <FieldTable fields={[
              { name: "type",      type: "string", req: true,  desc: 'Тип события: "maintenance", "repair", "accident" и т.д.' },
              { name: "date",      type: "string", req: true,  desc: "Дата события YYYY-MM-DD" },
              { name: "entity_id", type: "string", req: false, desc: "ID объекта (авто или водителя)" },
              { name: "title",     type: "string", req: false, desc: "Заголовок события" },
              { name: "amount",    type: "number", req: false, desc: "Сумма (руб.)" },
              { name: "meta",      type: "object", req: false, desc: "Произвольные дополнительные поля (JSON)" },
              { name: "source",    type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          {/* ═══════════════════════════════════════════════════════════
              ФИНАНСЫ И ОПЕРАЦИИ
          ════════════════════════════════════════════════════════════ */}
          <GroupHeader>Финансы и операции</GroupHeader>

          <EndpointSection id="ingest-trips" title="Поездки">
            <EndpointBadge method="POST" path="/ingest/trips" permission="ingest:trips" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Детализация поездок по агрегаторам (Яндекс, Uber, Gett и др.).
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id + source</code>.
            </p>
            <FieldTable fields={[
              { name: "external_id",  type: "string", req: true,  desc: "ID поездки в TaxiCRM" },
              { name: "trip_date",    type: "string", req: true,  desc: "Дата поездки YYYY-MM-DD" },
              { name: "driver_id",    type: "string", req: false, desc: "ID водителя" },
              { name: "car_plate",    type: "string", req: false, desc: "Госномер авто" },
              { name: "park_code",    type: "string", req: false, desc: "Код парка" },
              { name: "aggregator",   type: "string", req: false, desc: "Агрегатор: yandex, uber, gett и т.д." },
              { name: "cabinet_id",   type: "string", req: false, desc: "ID кабинета агрегатора" },
              { name: "trips_count",  type: "number", req: false, desc: "Количество поездок в записи (по умолчанию 1)" },
              { name: "revenue",      type: "number", req: false, desc: "Выручка (руб.)" },
              { name: "source",       type: "string", req: false, desc: 'Источник, по умолчанию "taxicrm"' },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-driver-balance" title="Баланс водителя">
            <EndpointBadge method="POST" path="/ingest/driver-balance" permission="ingest:driver-balance" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Текущий баланс водителей в разрезе агрегаторов.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>driver_id + balance_date + aggregator + source</code>.
            </p>
            <FieldTable fields={[
              { name: "driver_id",    type: "string", req: true,  desc: "ID водителя" },
              { name: "balance_date", type: "string", req: true,  desc: "Дата баланса YYYY-MM-DD" },
              { name: "balance",      type: "number", req: false, desc: "Баланс (руб.)" },
              { name: "aggregator",   type: "string", req: false, desc: "Агрегатор (yandex, uber и т.д.)" },
              { name: "cabinet_id",   type: "string", req: false, desc: "ID кабинета агрегатора" },
              { name: "source",       type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-driver-transactions" title="Транзакции водителей">
            <EndpointBadge method="POST" path="/ingest/driver-transactions" permission="ingest:driver-transactions" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Движение средств по счётам водителей (приход / расход).
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id + source</code>.
            </p>
            <FieldTable fields={[
              { name: "external_id",       type: "string", req: true,  desc: "ID транзакции в TaxiCRM" },
              { name: "driver_id",         type: "string", req: true,  desc: "ID водителя" },
              { name: "transaction_date",  type: "string", req: true,  desc: "Дата YYYY-MM-DD" },
              { name: "direction",         type: "number", req: false, desc: "1 = приход, 2 = расход" },
              { name: "amount",            type: "number", req: false, desc: "Сумма (руб.)" },
              { name: "transaction_type",  type: "string", req: false, desc: "Тип транзакции" },
              { name: "description",       type: "string", req: false, desc: "Описание" },
              { name: "account",           type: "string", req: false, desc: "Счёт" },
              { name: "cabinet_id",        type: "string", req: false, desc: "ID кабинета агрегатора" },
              { name: "source",            type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-car-transactions" title="Транзакции авто">
            <EndpointBadge method="POST" path="/ingest/car-transactions" permission="ingest:car-transactions" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Расходы и доходы, привязанные к конкретному автомобилю.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id + source</code>.
            </p>
            <FieldTable fields={[
              { name: "external_id",      type: "string", req: true,  desc: "ID транзакции в TaxiCRM" },
              { name: "transaction_date", type: "string", req: true,  desc: "Дата YYYY-MM-DD" },
              { name: "car_id",           type: "string", req: false, desc: "ID авто в TaxiCRM" },
              { name: "car_plate",        type: "string", req: false, desc: "Госномер авто" },
              { name: "direction",        type: "number", req: false, desc: "1 = приход, 2 = расход" },
              { name: "amount",           type: "number", req: false, desc: "Сумма (руб.)" },
              { name: "transaction_type", type: "string", req: false, desc: "Тип транзакции" },
              { name: "description",      type: "string", req: false, desc: "Описание" },
              { name: "source",           type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-payouts" title="Выплаты водителям">
            <EndpointBadge method="POST" path="/ingest/payouts" permission="ingest:payouts" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Зафиксированные выплаты водителям — зарплата, бонусы, компенсации.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id + source</code>, обновляет статус.
            </p>
            <FieldTable fields={[
              { name: "external_id",  type: "string", req: true,  desc: "ID выплаты в TaxiCRM" },
              { name: "driver_id",    type: "string", req: true,  desc: "ID водителя" },
              { name: "payout_date",  type: "string", req: true,  desc: "Дата выплаты YYYY-MM-DD" },
              { name: "amount",       type: "number", req: false, desc: "Сумма выплаты (руб.)" },
              { name: "method",       type: "string", req: false, desc: "Способ: карта, наличные, СБП и т.д." },
              { name: "status",       type: "string", req: false, desc: "Статус выплаты" },
              { name: "source",       type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-penalties" title="Штрафы">
            <EndpointBadge method="POST" path="/ingest/penalties" permission="ingest:penalties" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Штрафы ГИБДД и внутренние штрафы парка.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id + source</code>, обновляет статус и скидку.
            </p>
            <FieldTable fields={[
              { name: "external_id",     type: "string", req: true,  desc: "ID штрафа в TaxiCRM" },
              { name: "car_id",          type: "string", req: false, desc: "ID авто в TaxiCRM" },
              { name: "car_plate",       type: "string", req: false, desc: "Госномер авто" },
              { name: "penalty_date",    type: "string", req: false, desc: "Дата и время штрафа (ISO 8601)" },
              { name: "penalty_source",  type: "string", req: false, desc: "Источник штрафа: ГИБДД, внутренний и т.д." },
              { name: "uin",             type: "string", req: false, desc: "УИН постановления" },
              { name: "ruling",          type: "string", req: false, desc: "Номер постановления" },
              { name: "amount",          type: "number", req: false, desc: "Сумма штрафа (руб.)" },
              { name: "amount_discount", type: "number", req: false, desc: "Сумма со скидкой (руб.)" },
              { name: "description",     type: "string", req: false, desc: "Описание нарушения" },
              { name: "status",          type: "string", req: false, desc: "actual_not_paid / paid / not_actual" },
              { name: "discount_till",   type: "string", req: false, desc: "Дата окончания скидки YYYY-MM-DD" },
              { name: "source",          type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-rentals" title="Аренда авто">
            <EndpointBadge method="POST" path="/ingest/rentals" permission="ingest:rentals" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Договоры аренды автомобилей — кто, на каком авто, по какому договору.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_id + source</code>, обновляет статус и даты.
            </p>
            <FieldTable fields={[
              { name: "external_id",   type: "string", req: true,  desc: "ID договора в TaxiCRM" },
              { name: "car_id",        type: "string", req: false, desc: "ID авто" },
              { name: "driver_id",     type: "string", req: false, desc: "ID водителя" },
              { name: "date_start",    type: "string", req: false, desc: "Дата начала YYYY-MM-DD" },
              { name: "date_end",      type: "string", req: false, desc: "Фактическая дата окончания YYYY-MM-DD" },
              { name: "expected_end",  type: "string", req: false, desc: "Плановая дата окончания YYYY-MM-DD" },
              { name: "amount",        type: "number", req: false, desc: "Сумма аренды (руб.)" },
              { name: "period",        type: "string", req: false, desc: "Период: час / день / неделя" },
              { name: "rent_type",     type: "string", req: false, desc: "Тип: usual / agency" },
              { name: "payment_type",  type: "string", req: false, desc: "Оплата: pre / post" },
              { name: "deposit",       type: "number", req: false, desc: "Залог (руб.)" },
              { name: "status",        type: "number", req: false, desc: "0 = закрыт, 1 = активен, 2 = на паузе" },
              { name: "source",        type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-shift-details" title="Детали смен">
            <EndpointBadge method="POST" path="/ingest/shift-details" permission="ingest:shift-details" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Детальная информация по смене — сданные и несданные наличные.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>external_shift_id + source</code>.
            </p>
            <FieldTable fields={[
              { name: "external_shift_id", type: "string", req: true,  desc: "ID смены в TaxiCRM" },
              { name: "driver_id",         type: "string", req: false, desc: "ID водителя" },
              { name: "shift_date",        type: "string", req: false, desc: "Дата смены YYYY-MM-DD" },
              { name: "cash_handed",       type: "number", req: false, desc: "Сдано наличных (руб.)" },
              { name: "cash_not_handed",   type: "number", req: false, desc: "Не сдано наличных (руб.)" },
              { name: "source",            type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-hire-funnel" title="Воронка найма">
            <EndpointBadge method="POST" path="/ingest/hire-funnel" permission="ingest:hire-funnel" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Статистика воронки найма водителей по этапам (из любой CRM-системы).
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>funnel_id + stage_name + stat_date + source</code>.
            </p>
            <FieldTable fields={[
              { name: "funnel_id",    type: "string", req: true,  desc: "ID воронки в TaxiCRM" },
              { name: "stage_name",   type: "string", req: true,  desc: "Название этапа воронки" },
              { name: "stat_date",    type: "string", req: true,  desc: "Дата статистики YYYY-MM-DD" },
              { name: "funnel_name",  type: "string", req: false, desc: "Название воронки" },
              { name: "deals_count",  type: "number", req: false, desc: "Количество сделок на этапе" },
              { name: "source",       type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          {/* ═══════════════════════════════════════════════════════════
              СПРАВОЧНИКИ
          ════════════════════════════════════════════════════════════ */}
          <GroupHeader>Справочники</GroupHeader>
          <InfoBox color="#6366F1" icon="📚">
            Справочные данные — кабинеты агрегаторов, типы транзакций, настройки выплат. Все три эндпоинта используют одно разрешение <code style={{ color: "#6366F1", fontFamily: "monospace" }}>ingest:references</code>.
          </InfoBox>

          <EndpointSection id="ingest-cabinets" title="Кабинеты агрегаторов">
            <EndpointBadge method="POST" path="/ingest/aggregator-cabinets" permission="ingest:references" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Список кабинетов агрегаторов (Яндекс, Uber, Gett и др.) и их статусы синхронизации.
            </p>
            <FieldTable fields={[
              { name: "external_id",  type: "string", req: true,  desc: "ID кабинета в TaxiCRM" },
              { name: "aggregator",   type: "string", req: true,  desc: "Агрегатор: yandex, uber, gett и т.д." },
              { name: "name",         type: "string", req: false, desc: "Название кабинета" },
              { name: "status",       type: "number", req: false, desc: "0=неактивен, 1=активен, 5=обновляется, 6=заблокирован" },
              { name: "last_success", type: "string", req: false, desc: "Дата последней успешной синхр. (ISO 8601)" },
              { name: "source",       type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-tx-types" title="Типы транзакций">
            <EndpointBadge method="POST" path="/ingest/transaction-types" permission="ingest:references" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Справочник типов транзакций для корректного отображения движения средств водителей и авто.
            </p>
            <FieldTable fields={[
              { name: "external_id",  type: "string", req: true,  desc: "ID типа в TaxiCRM" },
              { name: "name",         type: "string", req: true,  desc: "Название типа транзакции" },
              { name: "entity_type",  type: "string", req: false, desc: "К чему относится: user / car" },
              { name: "source",       type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          <EndpointSection id="ingest-payout-settings" title="Настройки выплат">
            <EndpointBadge method="POST" path="/ingest/payout-settings" permission="ingest:references" />
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Настройки периодичности и способа выплат для каждого водителя.
              Upsert по <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>driver_id + source</code>.
            </p>
            <FieldTable fields={[
              { name: "driver_id",     type: "string", req: true,  desc: "ID водителя" },
              { name: "method",        type: "string", req: false, desc: "Способ выплаты: карта, СБП, наличные и т.д." },
              { name: "period",        type: "string", req: false, desc: "Периодичность: день, неделя, месяц" },
              { name: "period_value",  type: "number", req: false, desc: "Значение периода (например, каждые 3 дня)" },
              { name: "source",        type: "string", req: false, desc: "Источник данных" },
            ]} />
          </EndpointSection>

          {/* ── Ошибки ───────────────────────────────────────────────── */}
          <section id="errors" style={{ marginBottom: 56 }}>
            <SectionTitle>Ошибки и коды</SectionTitle>
            <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" }}>
              Все ответы имеют формат <code style={{ color: "#F59E0B", fontFamily: "monospace" }}>{`{ ok: boolean, data?: ..., error?: string }`}</code>.
            </p>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1E2433" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#131929" }}>
                    {["HTTP код", "Значение", "Что делать"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["200 OK", "Успешно принято", "Данные сохранены. Смотрите поле data.inserted"],
                    ["400 Bad Request", "Ошибка в данных", "Проверьте обязательные поля и форматы (YYYY-MM-DD)"],
                    ["401 Unauthorized", "Нет API-ключа или ключ неверный", "Проверьте заголовок X-API-Key. Ключ не отозван?"],
                    ["403 Forbidden", "Нет разрешения", "Ключ не имеет нужного permission. Пересоздайте с нужными правами"],
                    ["429 Too Many Requests", "Слишком много запросов", "Добавьте паузу между запросами, не чаще 1 раза в секунду"],
                    ["500 Server Error", "Ошибка сервера", "Повторите через минуту. Если ошибка повторяется — свяжитесь с нами"],
                  ].map(([code, meaning, action], i) => (
                    <tr key={code} style={{ borderTop: i > 0 ? "1px solid #1E2433" : undefined, background: i % 2 === 0 ? "transparent" : "#0D1117" }}>
                      <td style={{ padding: "10px 16px" }}><code style={{ fontSize: 12, color: "#F59E0B", fontFamily: "monospace" }}>{code}</code></td>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: "#CBD5E1" }}>{meaning}</td>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: "#64748B" }}>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── FAQ ──────────────────────────────────────────────────── */}
          <section id="faq" style={{ marginBottom: 56 }}>
            <SectionTitle>FAQ</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                {
                  q: "Что будет, если отправить одну и ту же запись дважды?",
                  a: "Ничего плохого. Все эндпоинты используют upsert — повторная отправка обновляет данные, но не создаёт дубли."
                },
                {
                  q: "Как часто можно отправлять данные?",
                  a: "Рекомендуем раз в час или раз в день. Не чаще 1 запроса в секунду на один эндпоинт."
                },
                {
                  q: "Сколько записей можно отправить за один запрос?",
                  a: "До 1000 записей в одном массиве records[]. Для больших объёмов разбивайте на батчи."
                },
                {
                  q: "Как узнать, сколько записей реально сохранилось?",
                  a: 'В ответе есть поле data.inserted — количество успешно сохранённых записей. Если data.errors — там ошибки по конкретным строкам.'
                },
                {
                  q: "Нужно ли передавать все поля?",
                  a: "Нет. Обязательные помечены звёздочкой в таблице полей. Все остальные можно пропустить — они сохранятся как null."
                },
                {
                  q: "Как получить API-ключ с нужными разрешениями?",
                  a: "Попросите администратора дашборда открыть Настройки → API-ключи и создать ключ, выбрав нужные разрешения из списка."
                },
                {
                  q: "Мы используем не TaxiCRM, а другую систему — подойдёт этот API?",
                  a: "Да, все эндпоинты универсальны. Неважно откуда данные — TaxiCRM, 1С, Атимо, собственная CRM или любой другой сервис. Укажите источник в поле source (например, \"1c\" или \"atimo\") — это помогает понимать откуда пришли данные."
                },
              ].map(({ q, a }, i) => (
                <div key={i} style={{ padding: "18px 20px", borderRadius: 12, background: "#131929", border: "1px solid #1E2433", marginBottom: 10 }}>
                  <p style={{ fontWeight: 700, color: "#E2E8F0", fontSize: 14, margin: "0 0 8px" }}>Q: {q}</p>
                  <p style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.7, margin: 0 }}>A: {a}</p>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: "1px solid #1E2433", paddingTop: 24, color: "#3D4A63", fontSize: 12, textAlign: "center" }}>
            YouPiter BI · Partner API v1 · 17 эндпоинтов · По вопросам интеграции обращайтесь к вашему менеджеру
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#3D4A63", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ display: "block", fontSize: 12, color: "#4A5568", padding: "3px 0", textDecoration: "none" }}>
      {children}
    </a>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "40px 0 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: "#1E2433" }} />
    </div>
  );
}

function EndpointSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 40, padding: "24px", borderRadius: 16, background: "#0D1420", border: "1px solid #1E2433" }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>{title}</h3>
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 16px", paddingBottom: 12, borderBottom: "1px solid #1E2433" }}>
      {children}
    </h2>
  );
}

function EndpointBadge({ method, path, permission }: { method: string; path: string; permission: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      <span style={{ padding: "4px 12px", borderRadius: 6, background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>
        {method}
      </span>
      <code style={{ fontSize: 13, color: "#E2E8F0", fontFamily: "monospace", background: "#1A2035", padding: "3px 10px", borderRadius: 6 }}>
        /api/v1{path}
      </code>
      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(245,158,11,0.1)", color: "#F59E0B", fontFamily: "monospace" }}>
        🔑 {permission}
      </span>
    </div>
  );
}

function FieldTable({ fields }: { fields: { name: string; type: string; req: boolean; desc: string }[] }) {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1E2433", marginTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#131929" }}>
            {["Поле", "Тип", "Обяз.", "Описание"].map((h) => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={f.name} style={{ borderTop: "1px solid #1E2433", background: i % 2 === 0 ? "transparent" : "#0A0F1A" }}>
              <td style={{ padding: "8px 12px" }}>
                <code style={{ fontSize: 12, color: f.req ? "#F59E0B" : "#94A3B8", fontFamily: "monospace" }}>{f.name}</code>
              </td>
              <td style={{ padding: "8px 12px" }}>
                <span style={{ fontSize: 11, color: "#4A5568", fontFamily: "monospace" }}>{f.type}</span>
              </td>
              <td style={{ padding: "8px 12px" }}>
                <span style={{ fontSize: 12, color: f.req ? "#10B981" : "#3D4A63" }}>{f.req ? "✓" : "—"}</span>
              </td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointGrid() {
  const groups = [
    {
      label: "Базовые", color: "#10B981",
      items: [
        { icon: "🕐", path: "/ingest/shifts",  label: "Смены" },
        { icon: "💰", path: "/ingest/revenue", label: "Выручка" },
        { icon: "👤", path: "/ingest/drivers", label: "Водители" },
        { icon: "🚗", path: "/ingest/cars",    label: "Машины" },
        { icon: "📋", path: "/ingest/events",  label: "События" },
      ],
    },
    {
      label: "Финансы и операции", color: "#F59E0B",
      items: [
        { icon: "🚕", path: "/ingest/trips",                label: "Поездки" },
        { icon: "💳", path: "/ingest/driver-balance",       label: "Баланс водителя" },
        { icon: "↕️", path: "/ingest/driver-transactions",  label: "Транзакции водителей" },
        { icon: "🔧", path: "/ingest/car-transactions",     label: "Транзакции авто" },
        { icon: "💸", path: "/ingest/payouts",              label: "Выплаты" },
        { icon: "⚠️", path: "/ingest/penalties",            label: "Штрафы" },
        { icon: "🔑", path: "/ingest/rentals",              label: "Аренда авто" },
        { icon: "📝", path: "/ingest/shift-details",        label: "Детали смен" },
        { icon: "🎯", path: "/ingest/hire-funnel",          label: "Воронка найма" },
      ],
    },
    {
      label: "Справочники", color: "#6366F1",
      items: [
        { icon: "🏢", path: "/ingest/aggregator-cabinets", label: "Кабинеты агрегаторов" },
        { icon: "📊", path: "/ingest/transaction-types",   label: "Типы транзакций" },
        { icon: "⚙️", path: "/ingest/payout-settings",    label: "Настройки выплат" },
      ],
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ fontSize: 11, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {g.items.map((item) => (
              <a key={item.path} href={`#ingest-${item.path.replace("/ingest/", "").replace(/-/g, "-")}`}
                style={{ padding: "12px 14px", borderRadius: 10, background: "#131929", border: `1px solid ${g.color}20`, textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#E2E8F0", marginBottom: 2 }}>{item.label}</div>
                <code style={{ fontSize: 10, color: g.color, fontFamily: "monospace" }}>{item.path}</code>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{
      background: "#0D1117", border: "1px solid #2D3A55", borderRadius: 10,
      padding: "16px 20px", fontSize: 13, lineHeight: 1.7, color: "#94A3B8",
      overflowX: "auto", fontFamily: "monospace", margin: "0 0 16px",
      whiteSpace: "pre-wrap", wordBreak: "break-all",
    }}>
      {children}
    </pre>
  );
}

function InfoBox({ children, color = "#3B82F6", icon = "⚠️" }: { children: React.ReactNode; color?: string; icon?: string }) {
  return (
    <div style={{
      display: "flex", gap: 12, padding: "14px 18px", borderRadius: 12,
      background: `${color}10`, border: `1px solid ${color}30`, marginBottom: 20,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.7, margin: 0 }}>{children}</p>
    </div>
  );
}
