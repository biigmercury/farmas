// Everything the farmer survey says, in each language. To add a language (for example Yoruba), add a "yo" text next to every
// "en" and "pg" below, add it to LANGUAGES, and the page offers it automatically.
// The Pidgin and any other wording should be read by a native speaker before the link is shared.

export type SurveyLang = "en" | "pg";

export const LANGUAGES: { key: SurveyLang; label: string }[] = [
  { key: "en", label: "English" },
  { key: "pg", label: "Pidgin" },
];

type T = Record<SurveyLang, string>;
export type Option = { v: string; t: T };
export type Question = {
  id: string;
  kind: "multi" | "single" | "scale" | "text";
  label: T;
  hint?: T;
  options?: Option[];
  low?: T;
  high?: T;
};

const o = (v: string, en: string, pg: string = en): Option => ({ v, t: { en, pg } });

export const FARM_QUESTIONS: Question[] = [
  {
    id: "q1", kind: "multi",
    label: { en: "Which animals do you keep?", pg: "Which animals you dey keep?" },
    hint: { en: "Tick all that apply.", pg: "Tick all wey apply." },
    options: [
      o("poultry", "Poultry (chicken)", "Fowl (chicken)"), o("goats", "Goats", "Goat"), o("sheep", "Sheep"),
      o("cattle", "Cattle", "Cow"), o("pigs", "Pigs", "Pig"), o("fish", "Fish"), o("rabbits", "Rabbits", "Rabbit"), o("other", "Other"),
    ],
  },
  {
    id: "q2", kind: "single",
    label: { en: "About how many animals do you have now, all together?", pg: "About how many animals you get now, all together?" },
    options: [o("under_50", "Under 50", "Less than 50"), o("50_200", "50 to 200"), o("201_1000", "201 to 1,000"), o("over_1000", "Over 1,000", "More than 1,000")],
  },
  {
    id: "q3", kind: "single",
    label: { en: "How many years have you been farming?", pg: "How many years you don dey farm?" },
    options: [o("under_1", "Under 1 year", "Less than 1 year"), o("1_3", "1 to 3 years"), o("4_10", "4 to 10 years"), o("over_10", "Over 10 years", "More than 10 years")],
  },
  {
    id: "q4", kind: "single",
    label: { en: "How do you keep records of your farm today?", pg: "How you dey keep record for your farm now?" },
    options: [
      o("nothing", "I do not write anything, I remember", "I no dey write anything, I dey remember am"),
      o("notebook", "In a notebook", "For notebook"), o("phone_notes", "Notes on my phone", "Notes for my phone"),
      o("spreadsheet_app", "A spreadsheet or an app", "Spreadsheet or app"), o("other", "Other"),
    ],
  },
  {
    id: "q5", kind: "single",
    label: { en: "Do you know your profit or loss for last month?", pg: "You know wetin you gain or lose last month?" },
    options: [o("exactly", "Yes, exactly", "Yes, I know am well"), o("roughly", "Roughly", "I sabi small"), o("no", "No", "No, I no know")],
  },
  {
    id: "q6", kind: "single",
    label: {
      en: "In the last 12 months, did sickness kill any of your animals? About how many?",
      pg: "For the last 12 months, sickness kill any of your animals? About how many?",
    },
    options: [o("none", "None"), o("1_10", "1 to 10"), o("11_50", "11 to 50"), o("over_50", "More than 50")],
  },
  {
    id: "q7", kind: "single",
    label: { en: "When your animals are sick, who do you call first?", pg: "When your animals sick, who you dey call first?" },
    options: [
      o("vet", "A vet", "Vet"), o("agrovet", "An agro-vet shop", "Agro-vet shop"), o("farmer", "Another farmer"),
      o("self", "I treat them myself", "I dey treat dem myself"), o("nobody", "Nobody"),
    ],
  },
  {
    id: "q8", kind: "single",
    label: { en: "How hard is it to reach a vet quickly?", pg: "E hard to reach vet quick?" },
    options: [o("easy", "Easy", "E easy"), o("sometimes_hard", "Sometimes hard", "Sometimes e dey hard"), o("very_hard", "Very hard", "E hard well well")],
  },
  {
    id: "q9a", kind: "single",
    label: { en: "Which phone do you use?", pg: "Which phone you dey use?" },
    options: [o("smartphone", "Smartphone"), o("button", "Button phone"), o("none", "I have no phone", "I no get phone")],
  },
  {
    id: "q9b", kind: "single",
    label: { en: "Do you use WhatsApp?", pg: "You dey use WhatsApp?" },
    options: [o("daily", "Every day"), o("sometimes", "Sometimes"), o("never", "Never", "I no dey use am")],
  },
  {
    id: "q10", kind: "single",
    label: { en: "Would you rather talk to your phone or type?", pg: "You prefer to talk to your phone or to type?" },
    options: [o("talk", "Talk"), o("type", "Type"), o("both", "Both")],
  },
  {
    id: "q11", kind: "single",
    label: { en: "Which language is easiest for you?", pg: "Which language you sabi pass?" },
    options: [o("yoruba", "Yoruba"), o("english", "English"), o("pidgin", "Pidgin"), o("hausa", "Hausa"), o("igbo", "Igbo"), o("other", "Other")],
  },
];

export const THOUGHT_QUESTIONS: Question[] = [
  {
    id: "q12", kind: "scale",
    label: { en: "How useful would FarmAs be for your farm?", pg: "FarmAs fit help your farm reach how much?" },
    low: { en: "Not useful", pg: "E no help" }, high: { en: "Very useful", pg: "E go help well well" },
  },
  {
    id: "q12b", kind: "scale",
    label: { en: "How easy was it to use?", pg: "E easy to use?" },
    low: { en: "Very hard", pg: "E hard well well" }, high: { en: "Very easy", pg: "E easy well well" },
  },
  {
    id: "q12c", kind: "single",
    label: { en: "Did the AI understand what you said?", pg: "The AI understand wetin you talk?" },
    options: [
      o("yes_all", "Yes, every time", "Yes, every time"), o("mostly", "Most of the time", "Most times"),
      o("not_really", "Not really", "E no too understand"), o("did_not_try", "I did not try it", "I no try am"),
    ],
  },
  {
    id: "q12d", kind: "single",
    label: { en: "Would you trust the AI's advice about a sick animal?", pg: "You go trust the AI advice about sick animal?" },
    options: [o("yes", "Yes"), o("with_vet", "Yes, but I would still call a vet", "Yes, but I go still call vet"), o("no", "No")],
  },
  {
    id: "q13", kind: "single",
    label: { en: "Which part would you use first?", pg: "Which part you go use first?" },
    options: [
      o("record_voice", "Record sales and costs by voice", "Record sales and money wey I spend with voice"),
      o("sickness_vet", "Help with sickness and finding a vet", "Help when animal sick and to find vet"),
      o("reminders", "Reminders for vaccines", "Reminder for vaccine"),
      o("profit", "See my profit", "See wetin I gain"),
      o("none", "None of these", "None of dem"),
    ],
  },
  {
    id: "q14", kind: "single",
    label: { en: "Would you pay for it? What price per month would feel fair?", pg: "You go pay for am? How much for one month go be fair?" },
    options: [
      o("free_only", "I would only use it free", "I go only use am if e free"), o("up_to_1000", "Up to ₦1,000"),
      o("1000_3000", "₦1,000 to ₦3,000"), o("3000_5000", "₦3,000 to ₦5,000"), o("more", "More than ₦5,000"),
    ],
  },
  {
    id: "q15", kind: "text",
    label: { en: "What worries you about using it?", pg: "Wetin dey worry you about using am?" },
    hint: { en: "Write in your own words.", pg: "Write am your own way." },
  },
  {
    id: "q16", kind: "text",
    label: { en: "If it could do one thing for your farm, what should it be?", pg: "If e fit do one thing for your farm, wetin you want make e be?" },
    hint: { en: "Write in your own words.", pg: "Write am your own way." },
  },
];

export const TRIED: Option[] = [
  o("yes_fully", "Yes, I tried everything", "Yes, I try everything"),
  o("yes_little", "Yes, a little", "Yes, small"),
  o("no", "No, I did not try it", "No, I no try am"),
];

export const DEMO_URL = "https://farmas-six.vercel.app/login";

export const UI = {
  title: { en: "FarmAs farmer survey", pg: "FarmAs farmer survey" } as T,
  welcomeTitle: { en: "Help us build a better app for livestock farmers", pg: "Help us build better app for livestock farmers" } as T,
  welcome: {
    en: "We are Team Imperials, and we are building FarmAs: an app that helps farmers keep records and look after sick animals. This takes about 10 minutes. First you will try the app on your phone, then answer some questions. There are no right or wrong answers, and you can skip any question.",
    pg: "We be Team Imperials, and we dey build FarmAs: app wey dey help farmers keep record and look after sick animals. E go take about 10 minutes. First you go try the app for your phone, then you go answer some questions. Right or wrong answer no dey, and you fit skip any question.",
  } as T,
  consent: {
    en: "I agree that my answers can be saved and used by Team Imperials to improve FarmAs and in our presentation. My name and phone number are only used if I choose to give them.",
    pg: "I gree say Team Imperials fit save my answers and use dem to make FarmAs better and for their presentation. Dem go only use my name and phone number if I choose to give dem.",
  } as T,
  stepNames: {
    en: ["Welcome", "Try FarmAs", "Your farm", "Your thoughts", "Finish"],
    pg: ["Welcome", "Try FarmAs", "Your farm", "Wetin you think", "Finish"],
  } as Record<SurveyLang, string[]>,
  stepOf: { en: "Step", pg: "Step" } as T,
  of: { en: "of", pg: "of" } as T,
  next: { en: "Next", pg: "Next" } as T,
  back: { en: "Back", pg: "Back" } as T,
  send: { en: "Send my answers", pg: "Send my answers" } as T,
  sending: { en: "Sending…", pg: "E dey send…" } as T,
  skipNote: { en: "You can skip any question.", pg: "You fit skip any question." } as T,
  language: { en: "Language", pg: "Language" } as T,
  tryTitle: { en: "First, try FarmAs for yourself", pg: "First, try FarmAs yourself" } as T,
  tryIntro: {
    en: "Use a practice farm. Nothing you do there is real, so you cannot break anything.",
    pg: "Use practice farm. Nothing wey you do there na real, so you no fit spoil anything.",
  } as T,
  trySteps: {
    en: [
      "Tap the button below. FarmAs opens in a new tab.",
      "Tap \"Use demo account\" on the login page.",
      "Tap \"AI\" at the bottom. Type, or tap the microphone and say: \"I sold 10 goats for 150k\". Then tap \"Yes, save\".",
      "Tap \"Listen\" under a reply to hear it read aloud. You can also change the language at the top.",
      "Tap \"Chatbot\" and ask: \"My goat is coughing, what should I do?\"",
      "Come back to this page and tap \"Next\".",
    ],
    pg: [
      "Tap the button wey dey below. FarmAs go open for new tab.",
      "Tap \"Use demo account\" for the login page.",
      "Tap \"AI\" for the bottom. Type, or tap the microphone and talk: \"I don sell 10 goat for 150k\". Then tap \"Yes, save\".",
      "Tap \"Listen\" under reply make you hear am. You fit still change the language for the top.",
      "Tap \"Chatbot\" and ask: \"My goat dey cough, wetin I go do?\"",
      "Come back to this page and tap \"Next\".",
    ],
  } as Record<SurveyLang, string[]>,
  openDemo: { en: "Open FarmAs demo", pg: "Open FarmAs demo" } as T,
  slowNote: {
    en: "If the first answer is slow, wait up to a minute. The app may have been asleep.",
    pg: "If the first answer slow, wait up to one minute. The app fit dey sleep.",
  } as T,
  triedQ: { en: "Did you try it?", pg: "You try am?" } as T,
  farmTitle: { en: "About you and your farm", pg: "About you and your farm" } as T,
  thoughtsTitle: { en: "What do you think of FarmAs?", pg: "Wetin you think about FarmAs?" } as T,
  finishTitle: { en: "Almost done", pg: "E don almost finish" } as T,
  finishIntro: {
    en: "These are optional. Give your details only if you would like us to contact you.",
    pg: "These one na optional. Give your details only if you want make we contact you.",
  } as T,
  name: { en: "Your first name (optional)", pg: "Your first name (optional)" } as T,
  phone: { en: "Your phone number (optional)", pg: "Your phone number (optional)" } as T,
  contactOk: {
    en: "You may call or message me for a short chat",
    pg: "You fit call or message me make we talk small",
  } as T,
  nameOk: {
    en: "You may use my first name if you quote me",
    pg: "You fit use my first name if you quote wetin I talk",
  } as T,
  needConsent: {
    en: "Please tick the box on the first page to agree.",
    pg: "Abeg tick the box for the first page to gree.",
  } as T,
  failed: {
    en: "We could not send your answers. Check your internet and try again.",
    pg: "We no fit send your answers. Check your internet and try again.",
  } as T,
  thanksTitle: { en: "Thank you!", pg: "Thank you!" } as T,
  thanks: {
    en: "Your answers are saved. They will help us make FarmAs better for farmers like you.",
    pg: "We don save your answers. Dem go help us make FarmAs better for farmers like you.",
  } as T,
  share: { en: "Know another farmer? Send them this survey.", pg: "You know another farmer? Send am this survey." } as T,
  copy: { en: "Copy the survey link", pg: "Copy the survey link" } as T,
  copied: { en: "Link copied", pg: "Link don copy" } as T,
};
