// On-Device AI Module (powered by Cactus Needle architecture)
// 100% offline, zero-knowledge, runs entirely on the user's device.
// Never transmits diary text, memories or tasks across any network.

import * as store from './store.js';

export const AI_CONFIG = {
  name: 'Cactus Needle Engine',
  version: '2.5.0-pro',
  mode: 'on-device-nlp',
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
    5: ['ecstatic', 'incredible', 'amazing', 'blessed', 'fantastic', 'proud', 'thrilled', 'celebrate', 'triumph', 'wonderful', 'joy', 'loved', 'awesome', 'victorious', 'delighted'],
    4: ['happy', 'productive', 'good', 'grateful', 'peaceful', 'enjoyed', 'relaxed', 'accomplished', 'smile', 'calm', 'energized', 'motivated', 'content', 'healthy', 'progress'],
    3: ['okay', 'fine', 'normal', 'routine', 'neutral', 'average', 'alright', 'regular', 'standard', 'moderate'],
    2: ['tired', 'stressed', 'anxious', 'down', 'exhausted', 'annoyed', 'frustrated', 'bored', 'busy', 'overwhelmed', 'worried', 'difficult', 'struggling', 'drained'],
    1: ['terrible', 'horrible', 'sick', 'depressed', 'crying', 'angry', 'devastated', 'sad', 'pain', 'broken', 'disaster', 'awful', 'grief', 'miserable', 'furious']
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
    work: ['work', 'client', 'meeting', 'project', 'boss', 'office', 'career', 'job', 'deadline', 'code', 'deploy', 'presentation', 'email', 'strategy'],
    health: ['gym', 'workout', 'exercise', 'diet', 'doctor', 'hospital', 'medicine', 'walk', 'sleep', 'running', 'fitness', 'nutrition', 'cardio', 'rest'],
    personal: ['family', 'kids', 'home', 'mom', 'dad', 'spouse', 'wife', 'husband', 'children', 'friend', 'friends', 'dinner', 'cooking', 'parent'],
    finance: ['budget', 'money', 'crypto', 'stocks', 'expense', 'salary', 'invoice', 'paid', 'bank', 'cost', 'revenue', 'profit', 'investment'],
    learning: ['book', 'read', 'course', 'study', 'learned', 'podcast', 'article', 'research', 'tutorial', 'lesson', 'insight', 'reading'],
    travel: ['trip', 'flight', 'travel', 'hotel', 'vacation', 'airport', 'holiday', 'drive', 'journey', 'destination', 'tour'],
    ideas: ['idea', 'brainstorm', 'concept', 'vision', 'future', 'dream', 'plan', 'strategy', 'goal', 'innovation']
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
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.length > 20 && s.length < 220);

  if (sentences.length <= 2) return sentences;

  // Score sentences by keyword significance
  const importantKeywords = /\b(learned|realized|accomplished|decided|proud|grateful|important|today was|goal|best part|lesson|breakthrough|progress)\b/i;
  const scored = sentences.map(s => ({
    sentence: s,
    score: (importantKeywords.test(s) ? 3 : 0) + (s.length > 35 && s.length < 140 ? 1 : 0)
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

// ---------- 7. Bullet to Story Expander ----------
// Expands quick, rough bullet notes into rich, flowing, expressive diary entries.
// Runs 100% on-device with zero network requests.
export function expandBulletsToStory(rawInput) {
  if (!rawInput || !rawInput.trim()) return '';

  // Clean html tags if any
  const cleanInput = rawInput.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '');

  // Extract non-empty lines
  const lines = cleanInput
    .split(/\n+/)
    .map(line => line.replace(/^[\s*\-•–—\d\.\)\>]+/, '').trim())
    .filter(line => line.length > 2);

  if (!lines.length) return '';

  // Categorize bullets into chronological narrative buckets
  const morningBucket = [];
  const afternoonBucket = [];
  const eveningBucket = [];
  const reflectionBucket = [];
  const generalBucket = [];

  const morningPatterns = /\b(morning|woke|breakfast|coffee|sunrise|early|am|\b7am\b|\b8am\b|\b9am\b|\b10am\b|\b11am\b)\b/i;
  const afternoonPatterns = /\b(afternoon|lunch|midday|meeting|client|office|work|call|deployed|code|pm|\b12pm\b|\b1pm\b|\b2pm\b|\b3pm\b|\b4pm\b|\b5pm\b)\b/i;
  const eveningPatterns = /\b(evening|dinner|walk|gym|workout|family|kids|home|night|bed|sleep|relax|supper|dusk|\b6pm\b|\b7pm\b|\b8pm\b|\b9pm\b|\b10pm\b)\b/i;
  const reflectionPatterns = /\b(grateful|learned|realized|proud|lesson|thought|felt|feeling|tomorrow|overall|reflection|breakthrough)\b/i;

  lines.forEach(line => {
    if (reflectionPatterns.test(line)) {
      reflectionBucket.push(line);
    } else if (morningPatterns.test(line)) {
      morningBucket.push(line);
    } else if (eveningPatterns.test(line)) {
      eveningBucket.push(line);
    } else if (afternoonPatterns.test(line)) {
      afternoonBucket.push(line);
    } else {
      generalBucket.push(line);
    }
  });

  // Distribute general items evenly across morning/afternoon if empty
  if (generalBucket.length > 0) {
    if (morningBucket.length === 0 && afternoonBucket.length === 0 && eveningBucket.length === 0) {
      // Divide evenly into 2 or 3 groups
      const third = Math.ceil(generalBucket.length / 3);
      morningBucket.push(...generalBucket.slice(0, third));
      afternoonBucket.push(...generalBucket.slice(third, third * 2));
      eveningBucket.push(...generalBucket.slice(third * 2));
    } else if (afternoonBucket.length === 0) {
      afternoonBucket.push(...generalBucket);
    } else {
      eveningBucket.push(...generalBucket);
    }
  }

  const formatBulletSentence = (bullet) => {
    let s = bullet.trim();
    // Normalize casing
    s = s.charAt(0).toUpperCase() + s.slice(1);
    // If it starts with common verbs or phrases, smooth it out
    if (/^(hit the|went to|started|had|attended|finished|worked on|met with|talked to|bought|cooked|read|walked|called|wrote)\b/i.test(s)) {
      s = 'I ' + s.charAt(0).toLowerCase() + s.slice(1);
    } else if (!/^(I|we|today|my|the|it)\b/i.test(s)) {
      // Add first-person context if lacking subject
      s = 'I focused on ' + s.charAt(0).toLowerCase() + s.slice(1);
    }
    if (!/[.!?]$/.test(s)) s += '.';
    return s;
  };

  const paragraphs = [];

  // Morning section
  if (morningBucket.length > 0) {
    const intros = [
      'The morning began on an active note.',
      'I started the day early and with clear intention.',
      'Starting off the day, my focus was aligned and energized.',
      'The day kicked off with purpose this morning.'
    ];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const sentences = morningBucket.map(formatBulletSentence).join(' ');
    paragraphs.push(`${intro} ${sentences}`);
  }

  // Afternoon / Midday section
  if (afternoonBucket.length > 0) {
    const intros = [
      'As the day progressed into the afternoon, things stayed productive.',
      'Heading into the afternoon, I turned my attention to key responsibilities.',
      'The middle part of the day was filled with steady momentum.',
      'Later in the day, I kept the energy moving forward.'
    ];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const sentences = afternoonBucket.map(formatBulletSentence).join(' ');
    paragraphs.push(`${intro} ${sentences}`);
  }

  // Evening section
  if (eveningBucket.length > 0) {
    const intros = [
      'By the time evening arrived, it was time to transition and unwind.',
      'As evening rolled around, the pace of the day shifted gracefully.',
      'Later in the evening, I carved out time to decompress and recharge.',
      'Wrapping things up toward the evening brought a welcome sense of calm.'
    ];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const sentences = eveningBucket.map(formatBulletSentence).join(' ');
    paragraphs.push(`${intro} ${sentences}`);
  }

  // Closing / Reflection section
  if (reflectionBucket.length > 0) {
    const sentences = reflectionBucket.map(formatBulletSentence).join(' ');
    paragraphs.push(`Looking back on today, ${sentences.charAt(0).toLowerCase() + sentences.slice(1)}`);
  } else if (paragraphs.length > 0) {
    const closings = [
      'Overall, today was grounded in steady progress and small wins.',
      'All in all, it felt like a purposeful and balanced day.',
      'I am wrapping up today feeling grateful for how everything came together.',
      'A solid day in the books with meaningful steps forward.'
    ];
    paragraphs.push(closings[Math.floor(Math.random() * closings.length)]);
  }

  return paragraphs.join('\n\n');
}

// ---------- 8. Polish & Tone Enhancer ----------
// Refines existing journal entries according to chosen creative styles:
// 'thoughtful' | 'poetic' | 'concise' | 'motivated'
export function polishJournalEntry(rawText, style = 'thoughtful') {
  if (!rawText || !rawText.trim()) return '';

  // Extract clean plain text
  let text = rawText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Common grammar & orthography normalization
  // 1. Capitalize lone lowercase 'i' and contractions (i'm, i've, i'll, i'd)
  text = text.replace(/\bi\b/g, 'I');
  text = text.replace(/\bi'm\b/gi, "I'm");
  text = text.replace(/\bi've\b/gi, "I've");
  text = text.replace(/\bi'll\b/gi, "I'll");
  text = text.replace(/\bi'd\b/gi, "I'd");

  // 2. Fix punctuation spacing
  text = text.replace(/\s+([.,!?:;])/g, '$1');
  text = text.replace(/([.,!?:;])(?=[A-Za-z])/g, '$1 ');

  // 3. Sentence capitalization
  text = text.replace(/(^|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());

  // Style transformations
  if (style === 'concise') {
    // Remove verbal fillers and tightens prose
    const fillers = [
      /\b(?:basically|to be honest|honestly speaking|in my opinion|sort of|kind of|i guess that|it seems like|pretty much|more or less)\b,?\s*/gi,
      /\b(?:really|very|actually|just)\s+/gi
    ];
    fillers.forEach(regex => {
      text = text.replace(regex, '');
    });
    // Re-capitalize after replacements
    text = text.replace(/(^|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    return text.trim();
  }

  if (style === 'motivated') {
    // Infuse high agency, action verbs and resilience
    text = text
      .replace(/\bi had to\b/gi, 'I prioritized')
      .replace(/\bi tried to\b/gi, 'I pushed forward to')
      .replace(/\bit was hard\b/gi, 'It was a demanding challenge, but I stayed with it')
      .replace(/\bi was tired\b/gi, 'I spent a tremendous amount of effort')
      .replace(/\bgood day\b/gi, 'high-momentum, winning day')
      .replace(/\bworked on\b/gi, 'drove execution on');

    if (!/[.!?]$/.test(text)) text += '.';
    return `${text}\n\nMomentum builds upon momentum — ready to carry this drive forward.`;
  }

  if (style === 'poetic') {
    // Atmospheric, sensory and reflective phrasing
    text = text
      .replace(/\btoday was\b/gi, 'Today carried a rare stillness and depth, as')
      .replace(/\bi woke up\b/gi, 'The morning light crept in as I woke')
      .replace(/\bit was raining\b/gi, 'A gentle rain tapped against the glass')
      .replace(/\bi felt happy\b/gi, 'A quiet warmth settled over me')
      .replace(/\bi felt peaceful\b/gi, 'A deep, abiding calm washed through the hours');

    if (!/[.!?]$/.test(text)) text += '.';
    return text;
  }

  // Default: 'thoughtful' (Reflective, introspective & balanced)
  text = text
    .replace(/\bi think\b/gi, 'Upon reflection, I realize')
    .replace(/\bnext time\b/gi, 'Looking ahead, a key takeaway is')
    .replace(/\bit made me mad\b/gi, 'It challenged my patience and invited me to pause')
    .replace(/\bi forgot\b/gi, 'It slipped my attention, offering a reminder to stay centered');

  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

// ---------- 9. Adaptive Daily Reflection Prompts ----------
export const DAILY_PROMPTS = [
  // Morning Intentions (5am - 12pm)
  {
    id: 'm1',
    category: 'Morning Intentions',
    timeSlot: 'morning',
    prompt: 'What is the single most meaningful outcome that would make today a triumph?',
    guidance: 'Focus on one priority rather than a long to-do list.',
    quote: 'The secret of getting ahead is getting started.'
  },
  {
    id: 'm2',
    category: 'Morning Intentions',
    timeSlot: 'morning',
    prompt: 'How do you want to show up for yourself and those around you today?',
    guidance: 'Name an attitude or energy: patient, decisive, joyful, or steady.',
    quote: 'Wherever you go, go with all your heart.'
  },
  {
    id: 'm3',
    category: 'Morning Intentions',
    timeSlot: 'morning',
    prompt: 'What is one distraction or worry you choose to let go of this morning?',
    guidance: 'Write it down to release its hold on your focus.',
    quote: 'You cannot step twice into the same river.'
  },

  // Midday Reset (12pm - 5pm)
  {
    id: 'a1',
    category: 'Midday Reset',
    timeSlot: 'afternoon',
    prompt: 'How is your energy right now, and what one adjustment will help you finish strong?',
    guidance: 'Check your physical tension, hydration, and mental state.',
    quote: 'Almost everything will work again if you unplug it for a few minutes.'
  },
  {
    id: 'a2',
    category: 'Midday Reset',
    timeSlot: 'afternoon',
    prompt: 'What has gone surprisingly well today that you haven’t paused to acknowledge?',
    guidance: 'Celebrate a small win or a smooth interaction.',
    quote: 'Enjoy the little things, for one day you may look back and realize they were big things.'
  },

  // Evening Gratitude & Closure (5pm - 4am)
  {
    id: 'e1',
    category: 'Evening Gratitude',
    timeSlot: 'evening',
    prompt: 'What were three small moments today that brought you unexpected joy or peace?',
    guidance: 'Notice simple sensory details: a warm drink, a smile, quiet music.',
    quote: 'Gratitude turns what we have into enough.'
  },
  {
    id: 'e2',
    category: 'Evening Gratitude',
    timeSlot: 'evening',
    prompt: 'What was a challenging moment from today, and what did it teach you about your resilience?',
    guidance: 'Reframe difficulty as strength in training.',
    quote: 'What stands in the way becomes the way.'
  },
  {
    id: 'e3',
    category: 'Evening Gratitude',
    timeSlot: 'evening',
    prompt: 'If you could send a sincere thank you to one person right now, who would it be and why?',
    guidance: 'Reflect on family, friends, mentors, or colleagues.',
    quote: 'Silent gratitude isn’t very much use to anyone.'
  },

  // Deep Reflection & Self-Growth (Anytime)
  {
    id: 'g1',
    category: 'Deep Reflection',
    timeSlot: 'any',
    prompt: 'What is a habit or belief you’ve been re-evaluating in your life lately?',
    guidance: 'Examine where you want to evolve and what no longer serves you.',
    quote: 'The unexamined life is not worth living.'
  },
  {
    id: 'g2',
    category: 'Deep Reflection',
    timeSlot: 'any',
    prompt: 'What does genuine success and inner peace look like for you in this season of life?',
    guidance: 'Define it in your own terms, away from societal expectations.',
    quote: 'Peace comes from within. Do not seek it without.'
  },
  {
    id: 'g3',
    category: 'Deep Reflection',
    timeSlot: 'any',
    prompt: 'What is an accomplishment or quiet victory from recently that went unnoticed by others?',
    guidance: 'Take pride in the internal milestones you have achieved.',
    quote: 'Honor your own journey.'
  }
];

export function getDailyReflectionPrompt(preference = 'auto') {
  const hour = new Date().getHours();
  let currentSlot = 'evening';
  if (hour >= 5 && hour < 12) currentSlot = 'morning';
  else if (hour >= 12 && hour < 17) currentSlot = 'afternoon';

  let filtered = DAILY_PROMPTS;
  if (preference === 'auto') {
    filtered = DAILY_PROMPTS.filter(p => p.timeSlot === currentSlot || p.timeSlot === 'any');
  } else if (preference !== 'all') {
    filtered = DAILY_PROMPTS.filter(p => p.timeSlot === preference || p.category.toLowerCase().includes(preference.toLowerCase()));
  }

  if (!filtered.length) filtered = DAILY_PROMPTS;
  const picked = filtered[Math.floor(Math.random() * filtered.length)];

  return {
    ...picked,
    templateHtml: `<blockquote>💡 <b>${picked.category}:</b> ${picked.prompt}</blockquote><p><br></p>`
  };
}

// ---------- 10. Weekly / Monthly Life Insights & Mood Analytics ----------
// Analyzes decrypted entries and tasks over a 7-day or 30-day window.
// Completely local, deterministic, and instant.
export function generateLifeInsights(entries, tasks, periodDays = 7) {
  const now = new Date();
  const periodMs = periodDays * 24 * 60 * 60 * 1000;
  const cutoffTime = now.getTime() - periodMs;
  const prevCutoffTime = cutoffTime - periodMs;

  const MOOD_META = {
    5: { label: 'Great', emoji: '😄', color: '#10B981' },
    4: { label: 'Good', emoji: '🙂', color: '#3B82F6' },
    3: { label: 'Okay', emoji: '😐', color: '#6B7280' },
    2: { label: 'Down', emoji: '🙁', color: '#F59E0B' },
    1: { label: 'Rough', emoji: '😣', color: '#EF4444' }
  };

  // Filter current period entries
  const currentEntries = (entries || []).filter(e => {
    const t = new Date(e.date + 'T12:00:00').getTime();
    return t >= cutoffTime;
  });

  // Filter prior period entries for trend comparison
  const priorEntries = (entries || []).filter(e => {
    const t = new Date(e.date + 'T12:00:00').getTime();
    return t >= prevCutoffTime && t < cutoffTime;
  });

  const totalEntries = currentEntries.length;
  const uniqueDates = new Set(currentEntries.map(e => e.date));
  const activeDays = uniqueDates.size;
  const consistencyRate = Math.min(100, Math.round((activeDays / periodDays) * 100));

  // Word count calculation
  let totalWords = 0;
  currentEntries.forEach(e => {
    const words = (e.text || '').trim().split(/\s+/).filter(Boolean);
    totalWords += words.length;
  });
  const avgWords = totalEntries ? Math.round(totalWords / totalEntries) : 0;

  // Mood statistics
  const moodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let moodSum = 0;
  let moodEntriesCount = 0;

  currentEntries.forEach(e => {
    if (e.mood && moodCounts[e.mood] !== undefined) {
      moodCounts[e.mood]++;
      moodSum += e.mood;
      moodEntriesCount++;
    }
  });

  const avgMood = moodEntriesCount ? Number((moodSum / moodEntriesCount).toFixed(1)) : 0;

  // Prior mood average
  let priorMoodSum = 0;
  let priorMoodCount = 0;
  priorEntries.forEach(e => {
    if (e.mood) {
      priorMoodSum += e.mood;
      priorMoodCount++;
    }
  });
  const priorAvgMood = priorMoodCount ? Number((priorMoodSum / priorMoodCount).toFixed(1)) : 0;

  let moodTrend = 'Steady';
  if (priorAvgMood && avgMood) {
    const diff = Number((avgMood - priorAvgMood).toFixed(1));
    if (diff > 0.2) moodTrend = `+${diff} vs previous period (Improving)`;
    else if (diff < -0.2) moodTrend = `${diff} vs previous period (Lower)`;
    else moodTrend = 'Consistent with previous period';
  }

  // Dominant mood
  let dominantMoodVal = 3;
  let maxMoodCount = -1;
  for (let m = 5; m >= 1; m--) {
    if (moodCounts[m] > maxMoodCount && moodCounts[m] > 0) {
      maxMoodCount = moodCounts[m];
      dominantMoodVal = m;
    }
  }
  const dominantMood = MOOD_META[dominantMoodVal] || MOOD_META[3];

  // Tag frequency and correlations
  const tagMap = {};
  const tagMoodMap = {};

  currentEntries.forEach(e => {
    (e.tags || []).forEach(t => {
      tagMap[t] = (tagMap[t] || 0) + 1;
      if (e.mood) {
        if (!tagMoodMap[t]) tagMoodMap[t] = { sum: 0, count: 0 };
        tagMoodMap[t].sum += e.mood;
        tagMoodMap[t].count++;
      }
    });
  });

  const topTags = Object.entries(tagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  // Best correlating tag
  let happiestTag = null;
  let highestTagAvg = -1;
  for (const [tag, data] of Object.entries(tagMoodMap)) {
    if (data.count >= 2) {
      const avg = data.sum / data.count;
      if (avg > highestTagAvg) {
        highestTagAvg = avg;
        happiestTag = tag;
      }
    }
  }

  // Tasks metrics
  const periodTasks = (tasks || []).filter(t => {
    if (t.updated && t.updated >= cutoffTime) return true;
    if (t.due) {
      const dueTime = new Date(t.due.slice(0, 10) + 'T12:00:00').getTime();
      return dueTime >= cutoffTime;
    }
    return false;
  });

  const completedTasks = periodTasks.filter(t => t.done).length;
  const pendingTasks = (tasks || []).filter(t => !t.done).length;

  // Extract key highlights across current entries
  const allHighlights = [];
  currentEntries.forEach(e => {
    const hl = extractHighlights(e.text || '');
    if (hl.length) allHighlights.push(...hl);
  });
  const topHighlights = allHighlights.slice(0, 4);

  // Generate Executive Summary narrative
  let executiveSummary = '';
  if (totalEntries === 0) {
    executiveSummary = `No journal entries were recorded in the past ${periodDays} days. Starting with just a 2-minute daily check-in is the easiest way to rebuild your rhythm!`;
  } else {
    const consistencyDescriptor = consistencyRate >= 70 ? 'an outstanding' : consistencyRate >= 40 ? 'a steady' : 'a developing';
    const moodDescriptor = avgMood >= 4.0 ? 'overwhelmingly positive and uplifting' : avgMood >= 3.0 ? 'balanced and grounded' : 'stressful with demanding days';

    executiveSummary = `Over the past ${periodDays} days, you logged **${totalEntries} entries** across **${activeDays} days**, showing ${consistencyDescriptor} **${consistencyRate}% journaling consistency** (${totalWords.toLocaleString()} total words written).\n\n` +
      `Your emotional tone averaged **${avgMood ? avgMood + ' / 5.0' : 'Grounded'}**, leaning predominantly **${dominantMood.label} (${dominantMood.emoji})**. Trend: ${moodTrend}.\n\n` +
      (topTags.length ? `Primary themes revolved around **${topTags.map(t => '#' + t.tag).join(', ')}**. ` : '') +
      (happiestTag ? `Noticeably, entries tagged with **#${happiestTag}** coincided with your highest mood ratings. ` : '') +
      (completedTasks > 0 ? `On the action front, you checked off **${completedTasks} tasks** during this cycle.` : `You currently have **${pendingTasks} open tasks** in your planner.`);
  }

  return {
    periodDays,
    totalEntries,
    activeDays,
    consistencyRate,
    totalWords,
    avgWords,
    moodCounts,
    avgMood,
    moodTrend,
    dominantMood,
    topTags,
    happiestTag,
    completedTasks,
    pendingTasks,
    topHighlights,
    executiveSummary
  };
}
