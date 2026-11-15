// Talking to Glance — what happens when the student says something that is
// not a line of math and not a command.
//
// People do not dictate. They think aloud: "uh", "hang on", "what does
// numerator mean", "where was I", "can you read that again". Every one of
// those used to get "I didn't catch any math in that", which is true and
// useless — and for someone who cannot see the screen, a tool that only
// answers when spoken to in exactly the right form is a tool they stop using.
//
// So plain talk gets a plain answer. All of it is decided here, by rules, with
// no model: that makes it instant, makes it work with no server, and makes it
// impossible for an answer to contain a step or a solution, because none of
// these answers is computed from the problem. The line this never crosses is
// the same as everywhere else: it reads, describes, explains words and
// writes down what they say. It never says what to do next.

import { asksToSolve } from './commands';

export type Talk =
  | { kind: 'filler' }
  | { kind: 'refuse' }
  | { kind: 'greeting' }
  | { kind: 'thanks' }
  | { kind: 'repeat' }
  | { kind: 'describes' }
  | { kind: 'capabilities' }
  | { kind: 'readProblem' }
  | { kind: 'status' }
  | { kind: 'define'; term: string; meaning: string }
  | { kind: 'unknownTerm'; term: string };

// Sounds and phrases that carry no content. A line made only of these is
// someone thinking; at the start of a line they are dropped.
const FILLER =
  'uh+|um+|er+|erm+|hm+|mm+|ah+|oh|ok|okay|so|well|right|like|yeah|yes|alright|' +
  'now|then|and|wait|hold on|hang on|one (?:second|sec|moment|minute)|' +
  'give me a (?:second|sec|moment|minute)|let me (?:think|see)|let\'s see|' +
  'i think|i guess|i mean|you know|thinking|sorry|please';
const ONLY_FILLER = new RegExp(`^(?:(?:${FILLER})\\b[\\s,.!?-]*)+$`, 'i');
const LEADING_FILLER = new RegExp(`^(?:(?:${FILLER}|it'?s|it is)\\b[\\s,.!?-]*)+`, 'i');

// Sounds that are never part of a line, wherever they fall in it. Kept to the
// ones that cannot be a word or a variable: "so" and "like" are dropped only
// from the front, because in the middle they may belong to the sentence.
const HESITATION = /(?:^|[\s,])(?:u+h+|u+m+|e+rm+|h+m+)(?=$|[\s,.!?])[,.]?/gi;

/** The line without the thinking-aloud in front of it or inside it. */
export function stripFiller(text: string): string {
  const stripped = text
    .replace(HESITATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_FILLER, '')
    .trim();
  return stripped || text.trim();
}

// Words a student meets in a problem or hears from this app. Each meaning is
// general: it is the same whatever problem is on screen, so it cannot point at
// a step. Longer names come first so "square root" is found before "root".
export const GLOSSARY: [RegExp, string, string][] = [
  [/\bsquare roots?\b/, 'square root', 'The square root of a number is the value that, multiplied by itself, gives that number.'],
  [/\bcube roots?\b/, 'cube root', 'The cube root of a number is the value that, used three times in a multiplication, gives that number.'],
  [/\bx[ -]?intercepts?\b/, 'x-intercept', 'The x-intercept is where a graph meets the horizontal axis. At that point, the vertical value is zero.'],
  [/\by[ -]?intercepts?\b/, 'y-intercept', 'The y-intercept is where a graph meets the vertical axis. At that point, the horizontal value is zero.'],
  [/\bplus or minus\b/, 'plus or minus', 'Plus or minus means there are two possible values: one found by adding and one found by subtracting.'],
  [/\bless than or equal to\b/, 'less than or equal to', 'Less than or equal to means a value can be smaller than another value or exactly the same as it.'],
  [/\bnumerators?\b/, 'numerator', 'The numerator is the top of a fraction: the part being divided.'],
  [/\bdenominators?\b/, 'denominator', 'The denominator is the bottom of a fraction: the part you divide by.'],
  [/\bfractions?\b/, 'fraction', 'A fraction is one amount divided by another, written with a top, the numerator, and a bottom, the denominator.'],
  [/\b(?:exponents?|powers?)\b/, 'exponent', 'An exponent says how many times a value is multiplied by itself. It is written small and raised, after the value.'],
  [/\bsquared\b/, 'squared', 'Squared means multiplied by itself: an exponent of two.'],
  [/\bcubed\b/, 'cubed', 'Cubed means used three times in a multiplication: an exponent of three.'],
  [/\bcoefficients?\b/, 'coefficient', 'A coefficient is the number multiplying a letter. In three x, the coefficient is three.'],
  [/\bvariables?\b/, 'variable', 'A variable is a letter that stands for a number.'],
  [/\bconstants?\b/, 'constant', 'A constant is a plain number, with no letter attached.'],
  [/\bslopes?\b/, 'slope', 'Slope describes how steep a line is and whether it rises or falls as it goes from left to right.'],
  [/\bintercepts?\b/, 'intercept', 'An intercept is a point where a graph crosses one of its axes.'],
  [/\blinear\b/, 'linear', 'Linear describes a relationship whose graph is a straight line.'],
  [/\bquadratics?\b/, 'quadratic', 'A quadratic is an expression or equation whose highest power is two. Its graph is usually a curved U shape.'],
  [/\bpolynomials?\b/, 'polynomial', 'A polynomial is an expression made by adding or subtracting terms with whole-number powers of variables.'],
  [/\bmonomials?\b/, 'monomial', 'A monomial is a polynomial with one term.'],
  [/\bbinomials?\b/, 'binomial', 'A binomial is a polynomial with two terms.'],
  [/\btrinomials?\b/, 'trinomial', 'A trinomial is a polynomial with three terms.'],
  [/\bdegrees?\b/, 'degree', 'A degree is the unit angles are measured in. A full turn is three hundred and sixty degrees. The degree of a polynomial is its largest exponent on a variable in any one term.'],
  [/\broots?\b/, 'root', 'A root of an equation is a value that makes the equation true.'],
  [/\bsolutions?\b/, 'solution', 'A solution is a value that makes an equation or inequality true.'],
  [/\bidentit(?:y|ies)\b/, 'identity', 'An identity is an equation that is true for every allowed value of its variables.'],
  [/\bfunctions?\b/, 'function', 'A function is a rule that gives exactly one output for each allowed input.'],
  [/\bdomains?\b/, 'domain', 'The domain of a function is the set of inputs it is allowed to have.'],
  [/\branges?\b/, 'range', 'The range of a function is the set of outputs it can produce.'],
  [/\bratios?\b/, 'ratio', 'A ratio compares two quantities by division.'],
  [/\bproportions?\b/, 'proportion', 'A proportion is an equation that says two ratios are equal.'],
  [/\bpercents?\b/, 'percent', 'Percent means out of one hundred.'],
  [/\bintegers?\b/, 'integer', 'An integer is a whole number, its negative, or zero.'],
  [/\brational numbers?\b/, 'rational number', 'A rational number can be written as one integer divided by another nonzero integer.'],
  [/\birrational numbers?\b/, 'irrational number', 'An irrational number cannot be written as a ratio of two integers.'],
  [/\bprimes?\b/, 'prime', 'A prime number is a whole number greater than one with exactly two positive factors: one and itself.'],
  [/\bmultiples?\b/, 'multiple', 'A multiple of a number is the result of multiplying that number by a whole number.'],
  [/\bmeans?\b/, 'mean', 'The mean is an average found by adding all the values and dividing by how many values there are.'],
  [/\bmedians?\b/, 'median', 'The median is the middle value when values are arranged in order.'],
  [/\bperimeters?\b/, 'perimeter', 'The perimeter is the distance around the outside of a two-dimensional shape.'],
  [/\bareas?\b/, 'area', 'Area is the amount of flat space inside a two-dimensional shape.'],
  [/\bvolumes?\b/, 'volume', 'Volume is the amount of space inside a three-dimensional object.'],
  [/\bradii\b|\bradiuses\b|\bradius\b/, 'radius', 'A radius is the distance from the center of a circle to its edge.'],
  [/\bdiameters?\b/, 'diameter', 'A diameter is the distance across a circle through its center.'],
  [/\bcircumferences?\b/, 'circumference', 'The circumference is the distance around a circle.'],
  [/\bhypotenuses?\b/, 'hypotenuse', 'The hypotenuse is the longest side of a right triangle. It is opposite the right angle.'],
  [/\bangles?\b/, 'angle', 'An angle is the amount of turn between two lines or rays that meet.'],
  [/\bparallel\b/, 'parallel', 'Parallel lines stay the same distance apart and never meet.'],
  [/\bperpendicular\b/, 'perpendicular', 'Perpendicular lines meet to make a right angle.'],
  [/\blogarithms?\b/, 'logarithm', 'A logarithm tells which exponent a base needs to produce a given number.'],
  [/\bbases?\b/, 'base', 'In an exponent, the base is the number or expression that is multiplied by itself.'],
  [/\bsines?\b/, 'sine', 'Sine is a trigonometric ratio that relates an angle in a right triangle to the side opposite it and the hypotenuse.'],
  [/\bcosines?\b/, 'cosine', 'Cosine is a trigonometric ratio that relates an angle in a right triangle to the side beside it and the hypotenuse.'],
  [/\btangents?\b/, 'tangent', 'Tangent is a trigonometric ratio that relates an angle in a right triangle to the side opposite it and the side beside it.'],
  [/\bpi\b/, 'pi', 'Pi is the constant ratio of a circle’s circumference to its diameter.'],
  [/\binfinity\b/, 'infinity', 'Infinity describes something without an end or limit. It is not an ordinary number.'],
  [/\blike terms\b/, 'like terms', 'Like terms have the same letters raised to the same exponents, so they can be added together.'],
  [/\bterms?\b/, 'term', 'A term is one of the pieces of an expression that are added or subtracted.'],
  [/\bexpressions?\b/, 'expression', 'An expression is numbers and letters joined by operations, with no equals sign.'],
  [/\bequations?\b/, 'equation', 'An equation says two things are equal. It has a left side, an equals sign, and a right side.'],
  [/\binequalit(?:y|ies)\b/, 'inequality', 'An inequality compares two sides with less than or greater than, instead of equals.'],
  [/\bfactors?\b/, 'factor', 'A factor is one of the things multiplied together to make a product.'],
  [/\bproducts?\b/, 'product', 'A product is the result of multiplying.'],
  [/\bquotients?\b/, 'quotient', 'A quotient is the result of dividing.'],
  [/\bsums?\b/, 'sum', 'A sum is the result of adding.'],
  [/\bdifferences?\b/, 'difference', 'A difference is the result of subtracting.'],
  [/\breciprocals?\b/, 'reciprocal', 'The reciprocal of a number is one divided by that number.'],
  [/\babsolute values?\b/, 'absolute value', 'The absolute value of a number is its size, ignoring whether it is negative.'],
  [/\b(?:parenthes[ie]s|brackets?)\b/, 'parentheses', 'Parentheses group part of a line so it is treated as one thing.'],
  [/\bsolve\b/, 'solve', 'Solving for a letter means working out which value of the letter makes the equation true. That part is yours to do.'],
  [/\bsimplify\b/, 'simplify', 'To simplify means to rewrite something in a shorter form that has the same value.'],
  // What this app itself says.
  [/\b(?:could ?n[o']t|can ?n[o']t|not) confirm(?:ed)?\b/, 'could not confirm', 'It means I could not verify that your line follows from the one before. It does not mean your line is wrong.'],
  [/\bchecks? out\b/, 'checks out', 'It means your line follows from the one before it. It does not mean the problem is finished.'],
  [/\bunsure\b/, 'unsure', 'Unsure means I could not fully read that line as math. Check it before you rely on it.'],
  [/\bglance\b/, 'glance', 'A glance is the shape of a line before its details: whether it is an equation, and what it contains, such as fractions or roots.'],
  [/\b(?:reader|scribe)(?: and scribe)?(?: mode)?\b/, 'reader and scribe', 'Reader and scribe is the default. I read the problem and write down your work. I never check, solve or hint.'],
  [/\bexam mode\b/, 'exam mode', 'In exam mode nothing is checked. You can still read, explore and write your work.'],
  [/\bhomework mode\b/, 'homework mode', 'In homework mode, after each line you save, you hear only whether it checks out or could not be confirmed.'],
  [/\bstudy mode\b/, 'study mode', 'In study mode, after each line you save, you hear whether it follows from the line before and which operation you used.'],
  [/\bnemeth\b/, 'Nemeth', 'Nemeth is the braille code for mathematics.'],
];

const ASKS_MEANING =
  /^(?:what(?:'s| is| are| does| do)|define|explain|meaning of|tell me what)\b|\bmeans?\??$|\bstand for\??$/i;
const MEANING_SUBJECT =
  /^(?:what (?:does|do) (?:an? |the )?(.+?) means?|what(?:'s| is| are) (?:an? |the )?(.+)|define (?:an? |the )?(.+)|explain (?:an? |the )?(.+)|meaning of (?:an? |the )?(.+)|tell me what (?:an? |the )?(.+?)(?: means?| is)?|(?:what does )?(?:an? |the )?(.+?) stand for)$/i;
const ASKS_FOR_PROBLEM =
  /\b(?:read|repeat|say|hear|what(?:'s| is| was))\b.*\b(?:problem|question)\b|^(?:the )?(?:problem|question)(?: again)?$/i;
const ASKS_STATUS =
  /\b(?:where (?:am|was) i|what line|which line|how many lines|what (?:have|did) i (?:written|write|got|done|said|say)|my work so far|where were we)\b/i;
const ASKS_CAPABILITIES =
  /\b(?:what can you do|what do you do|what is this|what's this|how does (?:this|it) work|how do i use|who are you|what are you)\b/i;

const GREETS = /^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: there| glance)?$/i;
const THANKS = /^(?:thanks|thank you|cheers|great|perfect|nice|cool|got it)(?: very much| a lot| glance)?$/i;
const ASKS_REPEAT =
  /^(?:(?:can|could) you )?(?:say that again|say it again|repeat(?: that| it)?|read that again|what did you say|what was that|pardon|sorry what|come again|again|what)(?: please)?$/i;

// Saying what you are about to do ("next I divide both sides by two") is not
// a line: nothing has been written yet. Carrying it out would be doing the
// step, so the student is asked for the line they get. The verbs are in the
// form an instruction takes; "x divided by two" is math and does not match.
const DESCRIBES_A_STEP =
  /\b(?:both sides|each side)\b|^(?:(?:next|now|then|first|i|we|you|let me|let's|i'll|i will|i'm going to|i am going to|going to|i want to|want to|i need to|need to|i have to|have to|should|can|just|gonna) )*(?:add|subtract|multiply|divide|factor|expand|distribute|simplify|cancel|combine|isolate|move|take|get rid of)\b/i;

/** What the student meant, when it was neither math nor a command. */
export function understandTalk(text: string): Talk | null {
  const said = text.trim().replace(/[.!?]+$/, '');
  if (!said) return null;
  if (ONLY_FILLER.test(said)) return { kind: 'filler' };

  // "Um, what is a coefficient" is the question "what is a coefficient".
  const lower = stripFiller(said).toLowerCase();
  if (GREETS.test(lower)) return { kind: 'greeting' };
  if (THANKS.test(lower)) return { kind: 'thanks' };
  if (ASKS_REPEAT.test(lower)) return { kind: 'repeat' };
  let unknownTerm: string | undefined;
  if (ASKS_MEANING.test(lower)) {
    // Match the requested word, not the whole question. Otherwise the entry
    // for "mean" would match every question ending in "mean".
    const question = MEANING_SUBJECT.exec(lower);
    const requestedTerm = question?.slice(1).find(Boolean)?.trim();
    if (requestedTerm) {
      for (const [pattern, term, meaning] of GLOSSARY) {
        if (pattern.test(requestedTerm)) return { kind: 'define', term, meaning };
      }
      unknownTerm = requestedTerm;
    }
  }
  if (asksToSolve(said)) return { kind: 'refuse' };
  if (DESCRIBES_A_STEP.test(lower)) return { kind: 'describes' };
  if (ASKS_CAPABILITIES.test(lower)) return { kind: 'capabilities' };
  if (ASKS_FOR_PROBLEM.test(lower)) return { kind: 'readProblem' };
  if (ASKS_STATUS.test(lower)) return { kind: 'status' };
  if (unknownTerm) return { kind: 'unknownTerm', term: unknownTerm };
  // "What does X mean" about a word that is not in the list. Only when the
  // question has that exact shape, so a line of math is never taken for one.
  return null;
}

export const SAYS = {
  filler: 'Take your time. When you are ready, say or type your next line.',
  greeting:
    'Hello. Say or type a line of your work and I will read it back. Ask what can you do to hear the rest.',
  thanks: 'You are welcome.',
  nothingToRepeat: 'I have not said anything yet.',
  describes:
    'That says what you are going to do. Do it, then say or type the whole line you get, and I will write it down.',
  refuse:
    'I cannot solve it, give the answer, or say what to do next. The work is yours. I can read the problem again, or explain a math word.',
  capabilities:
    'I read math aloud and write down what you say. Say or type a line and I read it back before saving it. You can also say: read the problem, where am I, what does numerator mean, delete line two, undo, or hand in. I never solve the problem or give hints.',
  examNoMeanings: 'Explaining words is off in exam mode.',
  unknownTerm: (term: string) =>
    `I do not have a meaning for ${term}. I can read the problem again, or explain words like fraction, numerator, exponent or coefficient.`,
  notMath:
    'You can say a line of math, like two x equals eight. Or ask me to read the problem, or ask what I can do.',
};
