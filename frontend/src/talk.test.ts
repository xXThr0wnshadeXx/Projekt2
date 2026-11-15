import { describe, expect, it } from 'vitest';
import { asksToSolve, looksLikeCommand } from './commands';
import { stripFiller, understandTalk } from './talk';

describe('understandTalk', () => {
  it.each([
    'uh',
    'ummm',
    'hang on',
    'okay so',
    'let me think',
    'hmm',
    'erm',
    'one second',
    'hold on',
    'give me a moment',
    'let me see',
    "let's see",
    'I think',
    'I guess',
    'you know',
    'um, hang on',
    'hmm let me think',
  ])('treats "%s" as filler', (phrase) => {
    expect(understandTalk(phrase)).toEqual({ kind: 'filler' });
  });

  it.each([
    'what is x',
    "I'm stuck",
    'just tell me',
    'how do I solve this',
    'give me a hint',
    "what's the value of y",
    'what should I do',
    'tell me the answer',
    'show me the answer',
    'work it out for me',
    'do it for me',
    "I don't know what to do",
    'what is the next step',
    'help me finish this',
    'I am lost',
    'um can you just tell me the answer',
    'please just tell me',
  ])('refuses "%s"', (phrase) => {
    expect(understandTalk(phrase)).toEqual({ kind: 'refuse' });
  });

  it.each([
    'divide both sides by two',
    'next I subtract three from both sides',
    "I'm going to factor it",
    'now multiply each side by three',
    'first add five',
    "I'll expand the product",
    'I will distribute the two',
    'I want to combine like terms',
    "let's cancel the common factor",
    'then simplify the expression',
    'I need to isolate x',
    'move the constant',
    'take the square root of both sides',
    'just expand the first term',
    'next I divide both sides by two',
    'subtract three from both sides',
  ])('recognizes "%s" as a plan', (phrase) => {
    expect(understandTalk(phrase)).toEqual({ kind: 'describes' });
  });

  it.each([
    'two x equals eight',
    'x divided by two equals four',
    'x squared minus four equals zero',
    'so x equals four',
    'the sum of x and three equals seven',
    'x over two plus one',
    'negative b plus or minus the square root of b squared',
    'x times y equals twelve',
    '2x = 8',
    '(x+1)/2 = 5',
    'the square root of x plus one all over two equals five',
    'x is less than five',
    'the absolute value of x equals three',
    'three times the quantity x plus one',
    'y to the power of three equals eight',
    'one half plus x equals two',
    'x minus 3 = 4',
    '2(x + 1) = 10',
    'um, y equals three',
    'x plus one over two',
  ])('keeps "%s" on the math path', (phrase) => {
    expect(understandTalk(phrase)).toBeNull();
  });

  it.each([
    ['hello', { kind: 'greeting' }],
    ['thanks', { kind: 'thanks' }],
    ['say that again', { kind: 'repeat' }],
    ['where was I', { kind: 'status' }],
    ['what can you do', { kind: 'capabilities' }],
    ['can you read the problem again', { kind: 'readProblem' }],
    ['what does hypotenuse mean', { kind: 'unknownTerm', term: 'hypotenuse' }],
    ['um, what is a coefficient', {
      kind: 'define',
      term: 'coefficient',
      meaning: 'A coefficient is the number multiplying a letter. In three x, the coefficient is three.',
    }],
  ])('answers "%s" using the matching talk response', (phrase, expected) => {
    expect(understandTalk(phrase)).toEqual(expected);
  });
});

describe('stripFiller', () => {
  it.each([
    ['uh okay so two x um equals eight', 'two x equals eight'],
    ['um', 'um'],
    ['  um  ', 'um'],
    ['hang on', 'hang on'],
    ['okay so 2x = 8', '2x = 8'],
    ['well x divided by two equals four', 'x divided by two equals four'],
    ['let me think, x equals four', 'x equals four'],
    ['I think y equals five', 'y equals five'],
    ['it is x plus one over two', 'x plus one over two'],
    ["it's x squared", 'x squared'],
    ['x plus um one', 'x plus one'],
    ['hmm, (x+1)/2 = 5', '(x+1)/2 = 5'],
    ['and negative b plus or minus one', 'negative b plus or minus one'],
    ['   x   equals   eight   ', 'x equals eight'],
    ['x times y equals twelve', 'x times y equals twelve'],
    ['the sum of x and three equals seven', 'the sum of x and three equals seven'],
    ['the square root of x plus one, end root', 'the square root of x plus one, end root'],
  ])('turns "%s" into "%s"', (phrase, expected) => {
    expect(stripFiller(phrase)).toBe(expected);
  });

  it.fails('drops a pause before an internal hesitation', () => {
    expect(stripFiller('x, um, plus one')).toBe('x plus one');
  });
});

describe('asksToSolve', () => {
  it.each([
    ['what is x', true],
    ["I'm stuck", true],
    ['just tell me the answer', true],
    ['how do I solve this', true],
    ['give me a hint', true],
    ['I am lost', true],
    ["I don't get it", true],
    ["what's the value of y", true],
    ['what should I do', true],
    ['show me the answer', true],
    ['work it out', true],
    ['do it for me', true],
    ['help me finish', true],
    ['give me a clue', true],
    ['what is the next step', true],
    ['two x equals eight', false],
    ['x divided by two equals four', false],
    ['the sum of x and three equals seven', false],
    ['so x equals four', false],
    ['negative b plus or minus the square root of b squared', false],
    ['(x+1)/2 = 5', false],
    ['what does numerator mean', false],
    ['help', false],
    ['check this step', false],
    ['read the problem', false],
  ])('classifies "%s" as a solution request when expected to be %s', (phrase, expected) => {
    expect(asksToSolve(phrase)).toBe(expected);
  });
});

describe('looksLikeCommand', () => {
  it.each([
    ['next line', true],
    ['previous line', true],
    ['please go to line two', true],
    ['jump to the first line', true],
    ['move to line three', true],
    ['read that again', true],
    ['delete line two', true],
    ['cross out line one', true],
    ['undo!', true],
    ['add a new line', true],
    ['check this step', true],
    ['what changed?', true],
    ['hand it in', true],
    ['save as pdf', true],
    ['commands', true],
    ['glance change three to four', true],
    ['okay help', true],
    ['two x equals eight', false],
    ['x divided by two equals four', false],
    ['the sum of x and three equals seven', false],
    ['x over two plus one', false],
    ['(x+1)/2 = 5', false],
    ['line segment a b', false],
    ['backwards difference', false],
    ['what is x', false],
    ['divide both sides by two', false],
  ])('detects a command in "%s" when expected to be %s', (phrase, expected) => {
    expect(looksLikeCommand(phrase)).toBe(expected);
  });
});
