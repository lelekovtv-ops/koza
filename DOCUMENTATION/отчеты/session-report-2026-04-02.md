# Session Report — 2 апреля 2026

## Обзор сессии

Масштабная сессия: создана система голоса, Track Lab, встроен Track View в Storyboard, процедурная музыка, два формата сценария.

---

## Часть 1: Voice System (01.04 вечер → 02.04 утро)

### Новые файлы
| Файл | Назначение |
|------|------------|
| `src/store/dialogue.ts` | DialogueLine store — извлечение реплик из сценария, оценка длительности |
| `src/store/voiceTrack.ts` | VoiceClip store — anchor система, magnetic/free, split/merge, stale tracking |
| `src/hooks/useSpeech.ts` | Web Speech API — очередь сегментов, RU/EN авто-детект, pre-buffer 500ms |
| `src/lib/moodSynth.ts` | Процедурная музыка — 7 настроений, аккорды, арпеджио, bass, Web Audio API |

### Изменения в существующих файлах
- `bibleParser.ts` — VoiceConfig тип + voice поле в CharacterEntry
- `bible.ts` — mergeCharacters сохраняет voice
- `bible/page.tsx` — VoiceSection UI (провайдер, ID, скорость, preview)
- `useSceneSync.ts` — автоизвлечение диалогов при изменении сценария
- `timeline/page.tsx` — VoiceTrackRow, субтитры overlay, TTS playback toggle
- `page.tsx` — dialogue + voiceTrack stores в project lifecycle
- `script.ts` — демо "Дочь Океана" (5 сцен, 16 реплик, 5 персонажей)
- `fincher.ts` — calculateSmartDurations (dialogue-aware), TimelineSegment карта для AI
- `sceneParser.ts` — Scene.estimatedDurationMs
- `screenplayFormat.ts` — фикс: action после dialogue+blank не классифицируется как dialogue

---

## Часть 2: Track Lab — ПРОРЫВ

### Концепция
**Любой контент = текст на дорожках.** Сценарий мгновенно раскладывается на мультидорожечный таймлайн без AI. AI приходит последним — конвертирует текстовые блоки в медиа.

### Track Lab (`/dev/track-lab`)
- 4 формата: Reels (15-60s), YouTube (1-10min), Реклама (15-60s), Кино
- 5 дорожек: VISUAL / VOICE / GRAPHICS / TITLES / MUSIC
- Парсер: `[СЕКЦИЯ]` теги + screenplay формат (INT/EXT, CHARACTER, DIALOGUE, V.O.)
- DaVinci навигация: Space, J/K/L, ←→, Home/End, trackpad scroll, pinch zoom, click-to-seek, auto-scroll
- Web Speech API с 500ms pre-buffer
- Демо: YouTube маркетинг-ролик + "Дочь Океана" (кино)

### Track View в StoryboardPanel
- Новый tab **TRACKS** (зелёный) рядом с Prompt Lab
- `EmbeddedTrackView` — парсит реальные блоки из редактора
- Voice = timebase, visual подстраивается
- После breakdown: шоты как отдельные клипы на VISUAL с filmstrip thumbnails
- TTS + music toggle в transport bar

---

## Часть 3: ScriptViewer — два формата

### Screenplay (Final Draft)
- Courier, отступы 24ch/11ch/18ch, CAPS для персонажей
- Классический кинематографический формат

### Rundown (Production)
- Sans-serif, два подрежима:
  - **Scenes**: таблица с #, TIME, TC, SCENE, DUR — продюсерский rundown
  - **Voice**: непрерывный поток голоса с таймкодами, visual cues в скобках

---

## Часть 4: MoodSynth — процедурная музыка

### Chord Progressions
| Mood | Аккорды | BPM | Характер |
|------|---------|-----|----------|
| Calm | C-Am-F-G | 60 | Арпеджио, синус, реверб |
| Sad | Am-F-C-Em | 52 | Медленное арпеджио, тихий бас |
| Mysterious | Dm-Bb-Am-Edim | 48 | Треугольник, глубокий LFO |
| Tense | Em-Cm-Dm-Edim | 80 | Пила, напряжённый бас |
| Dramatic | Dm-Am-Bb-C | 100 | Блок-аккорды, мощный бас |
| Joyful | C-G-Am-F | 110 | Быстрое арпеджио, треугольник |
| Action | Em-Dm-C-Bdim | 130 | Квадрат + пила, агрессивный |

### MOOD дорожка
- SVG кривая с gradient фоном
- 😊 Joyful → 😌 Calm → 😢 Sad → 😰 Tense → 💥 Dramatic
- Drag точки вверх/вниз = управление настроением
- Double-click = новая точка
- Музыка следует кривой в реальном времени

---

## Имена (Disney → Original)
| Disney | Наше |
|--------|------|
| Ариэль | Марина |
| Себастьян | Краб |
| Принц Эрик | Принц Леон |
| Король Тритон | Король Нерей |
| Урсула | Мурена |
| Русалочка | Дочь Океана |

---

## Открытые вопросы (для следующей сессии)

1. **Shot/voice sync** — шоты на VISUAL не совпадают по времени с voice блоками. Нужен placement engine который ставит шот ТУДА где говорит его персонаж
2. **Voice блоки пропадают** — последнее изменение merge логики сломало фильтр. Нужно починить
3. **Первый шот слишком длинный** — calculateSmartDurations даёт 12s первому шоту вместо равномерного распределения
4. **Фундаментальная задача**: два независимых датасета (voice из текста + shots из AI) нужно совместить на одном таймлайне по смыслу

---

## Статистика
- Новых файлов: 4
- Изменённых файлов: ~15
- TypeScript ошибок: 0
- Build: проходит
- Новых компонентов: EmbeddedTrackView, VoiceTrackRow, VoiceSection, MoodSynth
- Новых stores: dialogue, voiceTrack
- Новых hooks: useSpeech
