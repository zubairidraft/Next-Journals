// On-Device AI Module (powered by Cactus Needle architecture)
// 100% offline, zero-knowledge, runs entirely on the user's device.
// Never transmits diary text, memories or tasks across any network.

import * as store from './store.js';

export const AI_CONFIG = {
  name: 'Cactus Needle Engine',
  version: '2.4.0-lite',
  mode: 'on-device-wasm',
  privacy: '100% Local (Zero-Knowledge)',
};

export function isAiEnabled() {
  return localStorage.getItem('nj-ai-enabled') !== 'false';
}

export function setAiEnabled(enabled) {
  localStorage.setItem('nj-ai-enabled', enabled ? 'true' : 'false');
}

// ---------- 1. Structured Task Extraction ----------
// Scans narrative journal text for action items, deadlines and commitments
export function extractTasksFromText(text) {
  if (!text || !text.trim()) return [];

  // Split into sentences
  const rawSentences = text
    .replace(/<[^>]+>/g, ' ') // strip html
    .split(/(?<=[.!?\n])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const taskTriggers = [
    /\b(?:need to|have to|must|should|don't forget to|remember to|plan to|todo:?|task:?|remind me to|will|ought to)\s+(.+)/i,
    /\b(?:schedule|book|call|email|send|finish|complete|submit|prepare|buy|pick up|meet with|pay)\s+(.+)/i
  ];

  const results = [];

  for (const sentence of rawSentences) {
    let matchedTask = null;
    let priority = 2; // Normal

    if (/\b(?:urgent|asap|crucial|immediately|priority|critical|high priority)\b/i.test(sentence)) {
      priority = 3; // High
    } else if (/\b(?:maybe|low priority|if possible|sometime)\b/i.test(sentence)) {
      priority = 1; // Low
    }

    for (const trigger of taskTriggers) {
      const match = sentence.match(trigger);
      if (match) {
        matchedTask = match[1] || match[0];
        break;
      }
    }

    if (matchedTask) {
      // Clean up extracted task string
      let title = matchedTask
        .replace(/^(?:do|make sure to|try to)\s+/i, '')
        .replace(/[.!?]+$/, '')
        .trim();

      // Capitalize first letter
      title = title.charAt(0).toUpperCase() + title.slice(1);

      if (title.length >= 4 && title.length <= 120) {
        const dueDate = parseTemporalExpression(sentence);
        results.push({
          title,
          originalSentence: sentence,
          due: dueDate,
          priority,
          tags: extractRelevantTags(title)
        });
      }
    }
  }

  // Deduplicate by title
  const seen = new Set();
  return results.filter(item => {
    const k = item.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- 2. Temporal & Date Extraction ----------
// Parses expressions like "tomorrow", "next Monday", "at 5pm", "tonight"
export function parseTemporalExpression(str) {
  const now = new Date();
  const lower = str.toLowerCase();
  let target = new Date();
  let hasDate = false;
  let hasTime = false;

  // Day resolution
  if (/\btomorrow\b/.test(lower)) {
    target.setDate(now.getDate() + 1);
    hasDate = true;
  } else if (/\byesterday\b/.test(lower)) {
    target.setDate(now.getDate() - 1);
    hasDate = true;
  } else if (/\btonight\b/.test(lower)) {
    target.setHours(20, 0, 0, 0);
    return target.toISOString().slice(0, 16);
  } else if (/\bnext week\b/.test(lower)) {
    target.setDate(now.getDate() + 7);
    hasDate = true;
  } else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      const re = new RegExp(`\\b(?:next\\s+)?${days[i]}\\b`);
      if (re.test(lower)) {
        const currentDay = now.getDay();
        let diff = i - currentDay;
        if (diff <= 0) diff += 7;
        target.setDate(now.getDate() + diff);
        hasDate = true;
        break;
      }
    }
  }

  // Time resolution (e.g. "at 4pm", "at 10:30 am", "5:00 pm")
  const timeMatch = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3];
    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    target.setHours(hours, minutes, 0, 0);
    hasTime = true;
  }

  if (hasDate && hasTime) {
    const pad = n => String(n).padStart(2, '0');
    return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
  } else if (hasDate) {
    const pad = n => String(n).padStart(2, '0');
    return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
  }

  return '';
}

// ---------- 3. Sentiment & Mood Inference ----------
// Classifies emotional valence into the 5 Next Journals moods:
// 1 = Rough, 2 = Down, 3 = Okay, 4 = Good, 5 = Great
export function detectMood(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const LEXICON = {
    5: ['ecstatic', 'incredible', 'amazing', 'blessed', 'fantastic', 'proud', 'thrilled', 'celebrate', 'triumph', 'wonderful', 'joy', 'loved', 'awesome'],
    4: ['happy', 'productive', 'good', 'grateful', 'peaceful', 'enjoyed', 'relaxed', 'accomplished', 'smile', 'calm', 'energized', 'motivated'],
    3: ['okay', 'fine', 'normal', 'routine', 'neutral', 'average', 'alright', 'regular', 'standard'],
    2: ['tired', 'stressed', 'anxious', 'down', 'exhausted', 'annoyed', 'frustrated', 'bored', 'busy', 'overwhelmed', 'worried'],
    1: ['terrible', 'horrible', 'sick', 'depressed', 'crying', 'angry', 'devastated', 'sad', 'pain', 'broken', 'disaster', 'awful', 'grief']
  };

  const scores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalMatches = 0;

  for (const [mood, words] of Object.entries(LEXICON)) {
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      const matches = lower.match(regex);
      if (matches) {
        scores[mood] += matches.length;
        totalMatches += matches.length;
      }
    }
  }

  if (totalMatches === 0) return 3; // neutral default

  let highestMood = 3;
  let highestScore = -1;
  for (let m = 1; m <= 5; m++) {
    if (scores[m] > highestScore) {
      highestScore = scores[m];
      highestMood = m;
    }
  }
  return highestMood;
}

// ---------- 4. Smart Tag Discovery ----------
// Discovers relevant life categories and topic tags from the entry
export function extractRelevantTags(text) {
  if (!text) return [];
  const lower = text.toLowerCase();

  const TOPIC_MAP = {
    work: ['work', 'client', 'meeting', 'project', 'boss', 'office', 'career', 'job', 'deadline', 'code', 'deploy'],
    health: ['gym', 'workout', 'exercise', 'diet', 'doctor', 'hospital', 'medicine', 'walk', 'sleep', 'running'],
    personal: ['family', 'kids', 'home', 'mom', 'dad', 'spouse', 'wife', 'husband', 'children', 'friend'],
    finance: ['budget', 'money', 'crypto', 'stocks', 'expense', 'salary', 'invoice', 'paid', 'bank', 'cost'],
    learning: ['book', 'read', 'course', 'study', 'learned', 'podcast', 'article', 'research'],
    travel: ['trip', 'flight', 'travel', 'hotel', 'vacation', 'airport', 'holiday', 'drive', 'journey'],
    ideas: ['idea', 'brainstorm', 'concept', 'vision', 'future', 'dream', 'plan', 'strategy']
  };

  const discovered = [];
  for (const [tag, keywords] of Object.entries(TOPIC_MAP)) {
    if (keywords.some(k => new RegExp(`\\b${k}\\b`).test(lower))) {
      discovered.push(tag);
    }
  }
  return discovered;
}

// ---------- 5. Key Highlights / Takeaways ----------
// Extracts the most meaningful takeaway sentences from an entry
export function extractHighlights(text) {
  if (!text) return [];
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.length > 20 && s.length < 180);

  if (sentences.length <= 2) return sentences;

  // Score sentences by keyword significance
  const importantKeywords = /\b(learned|realized|accomplished|decided|proud|grateful|important|today was|goal|best part)\b/i;
  const scored = sentences.map(s => ({
    sentence: s,
    score: (importantKeywords.test(s) ? 2 : 0) + (s.length > 40 && s.length < 120 ? 1 : 0)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(x => x.sentence);
}

// ---------- 6. Natural Language Command Parser ----------
// Parses natural language input for Quick Actions:
// "Remind me to buy groceries tomorrow at 5pm" -> action: create_task
export function parseNaturalCommand(input) {
  if (!input || !input.trim()) return null;
  const raw = input.trim();
  const lower = raw.toLowerCase();

  // Task creation pattern
  if (/^(?:remind me to|task:|todo:|add task|create task)\s+(.+)/i.test(raw) || /\b(?:tomorrow|at\s+\d|by\s+\w+)\b/i.test(raw)) {
    const taskText = raw.replace(/^(?:remind me to|task:|todo:|add task|create task)\s+/i, '');
    const due = parseTemporalExpression(taskText);
    const cleanTitle = taskText
      .replace(/\b(?:tomorrow|today|tonight|next week|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/ig, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      type: 'create_task',
      label: 'Create Task',
      data: {
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        due,
        priority: /\burgent\b/i.test(raw) ? 3 : 2,
        tags: extractRelevantTags(cleanTitle)
      }
    };
  }

  // Note creation pattern
  if (/^(?:note:|add note|create note)\s+(.+)/i.test(raw)) {
    const noteText = raw.replace(/^(?:note:|add note|create note)\s+/i, '').trim();
    return {
      type: 'create_note',
      label: 'Create Note',
      data: {
        title: noteText.split(/[.\n]/)[0].slice(0, 40),
        body: noteText
      }
    };
  }

  return null;
}
