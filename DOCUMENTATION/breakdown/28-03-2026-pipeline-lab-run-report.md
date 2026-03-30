# Pipeline Lab — Full Run Report
## 28.03.2026

---

## Схема пайплайна (8 модулей)

```
Director's Eye ──→ Scene Analyst ──┬──→ Detail Packer      ──┐
     (vision)        (shots)      ├──→ Continuity Editor   ──┼──→ Final Assembler ──→ Prompt Optimizer
                                  ├──→ Shot Card (user)      │        (merge)            (clean+style)
                                  └──→ Prompt Writer       ──┘
```

### Модули

| # | Модуль | Задача | Модель | Время |
|---|--------|--------|--------|-------|
| 1 | Director's Eye | Художественное видение сцены (Спилберг + Дикинс) | gpt-5.4 | 4.4s |
| 2 | Scene Analyst | Суть + разделение на кадры (Земекис) | gpt-5.4 | 9.0s |
| 3 | Detail Packer | Детали каждого кадра: персонаж, локация, планы, приоритеты | gpt-4o | ~12s (parallel) |
| 4 | Continuity Editor | Монтажные правила: позиции, 180°, склейки | gpt-4o | ~12s (parallel) |
| 5 | Shot Card | Карточка кадра: action / director / operator | gpt-4o | ~12s (parallel) |
| 6 | Prompt Writer | Промпт для Nano Banana по гайду | gpt-4o | ~12s (parallel) |
| 7 | Final Assembler | Сборка: промпт + детали + continuity | gpt-5.4 | 6.2s |
| 8 | Prompt Optimizer | Чистка: дубли, стиль первым словом, 200-300 chars | gpt-4o | 5.1s |

**Общее время: 37 сек** (с параллелизацией 4 ботов)

---

## Тестовая сцена

```
INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора.
БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — номер скрыт. Медленно берёт трубку.

БОРИС: Алло?
Пауза. Тяжёлое дыхание на том конце.

ГОЛОС (V.O.): Выходи. У тебя пять минут.

Борис роняет трубку. Смотрит в окно — на улице стоит чёрная машина.
```

**Bible:** БОРИС — 55 лет, усталое лицо, щетина, мятая рубашка
**Стиль:** Anime style, cel shading, dramatic lighting

---

## Результат — 5 кадров

### Shot 1: Камера приближается к окну
| | |
|---|---|
| **ACTION** | Камера приближается к окну, видны силуэты в комнате |
| **DIRECTOR** | Создать эффект вторжения в личное пространство Бориса |
| **OPERATOR** | Вид с улицы, через окно, средняя крупность, приближение |
| **ПРОМПТ** | Anime style, exterior view through window, Boris' silhouette lit by blue TV light, street view, dramatic lighting, tense atmosphere, 16:9. No text, no watermarks. |
| **Длина** | 199 chars |
| **Приоритеты** | Вид с улицы · Свет телевизора |

### Shot 2: Борис за столом
| | |
|---|---|
| **ACTION** | Борис сидит за столом, освещён телевизором |
| **DIRECTOR** | Подчеркнуть внутреннюю борьбу и усталость |
| **OPERATOR** | Средний план, статичная камера |
| **ПРОМПТ** | Anime style, Boris at table, face lit by TV creating deep shadows, medium shot, static camera, focus on emotional turmoil, dramatic lighting, 16:9. No text, no watermarks. |
| **Длина** | 198 chars |
| **Приоритеты** | Драматическое освещение · Эмоции Бориса |

### Shot 3: Телефон звонит
| | |
|---|---|
| **ACTION** | Телефон звонит, вибрирует на столе |
| **DIRECTOR** | Предвестник угрозы и изменения |
| **OPERATOR** | Крупный план, немного сверху, статика |
| **ПРОМПТ** | Anime style, close-up of vibrating phone, slight overhead angle, dramatic lighting, tension, phone centered, 16:9. No text, no watermarks. |
| **Длина** | 166 chars |
| **Приоритеты** | Вибрация телефона · Звонок |

### Shot 4: Борис берёт трубку
| | |
|---|---|
| **ACTION** | Борис берёт трубку, взгляд напряжённый |
| **DIRECTOR** | Демонстрация внутреннего конфликта |
| **OPERATOR** | Средний план, фокус на лице, статика |
| **ПРОМПТ** | Anime style, Boris taking phone with tense expression, medium shot focused on face, dramatic lighting highlighting internal conflict, 16:9. No text, no watermarks. |
| **Длина** | 197 chars |
| **Приоритеты** | Лицо Бориса · Трубка телефона |

### Shot 5: Борис смотрит на машину
| | |
|---|---|
| **ACTION** | Борис смотрит в окно на машину с фарами |
| **DIRECTOR** | Олицетворить угрозу и неизбежность |
| **OPERATOR** | Низкий угол сзади, средняя крупность |
| **ПРОМПТ** | Anime style, Boris looking out window at black car with headlights, low angle from behind, contrast of lights and dark room, sense of threat, 16:9. No text, no watermarks. |
| **Длина** | 203 chars |
| **Приоритеты** | Контраст света и тени · Машина |

---

## Найденные проблемы

1. **Scene Analyst** — возвращает текст вместо JSON (промпт слишком длинный/сложный)
2. **Continuity Editor** — JSON не парсится (формат ответа нестабильный)
3. **Промпты содержат абстракции** — "emotional turmoil", "sense of threat" → генератор не понимает
4. **Нет деталей** — пепельница, документы, щетина не попали в промпты

## Что работает хорошо

1. **Параллелизация** — 4 бота за 12 сек вместо 48
2. **Prompt Optimizer** — реально чистит ("removed central third for brevity")
3. **Shot Card** — чёткие карточки action/director/operator
4. **Размер промптов** — 166-203 символа, идеально для Nano Banana
5. **Первый кадр через окно** — неожиданная режиссёрская находка
