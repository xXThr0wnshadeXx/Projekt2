import { expect, test } from '@playwright/test';
import { askAbout, parseLine } from '../../frontend/src/math/ask';

const absent = {
  top: 'There is no fraction in this line.',
  bottom: 'There is no fraction in this line.',
  root: 'There is no root in this line.',
  power: 'There is no exponent in this line.',
  left: 'There is no left side in this line.',
  right: 'There is no right side in this line.',
  leftTerms: 'There is no left side in this line.',
  rightTerms: 'There is no right side in this line.',
  brackets: 'There are no brackets in this line.',
  kind: 'An expression.',
};

const questions: [keyof typeof absent, string[]][] = [
  ['top', ["what's on top?", "what’s the top?", 'numerator']],
  ['bottom', ["what's on the bottom?", 'denominator']],
  ['root', ["what's under the root?", 'inside the square root']],
  ['power', ["what's the power?", "what's the exponent?"]],
  ['left', ["what's on the left?", 'left side']],
  ['right', ['right side']],
  ['leftTerms', ['how many terms on the left?']],
  ['rightTerms', ['how many terms on the right?']],
  ['brackets', ["what's in the brackets?"]],
  ['kind', ['what kind of line is this?', 'what is this?']],
];

const oneLeft = 'There is 1 term on the left.';
const oneRight = 'There is 1 term on the right.';

const samples: [string, Partial<typeof absent>][] = [
  [String.raw`\frac{\sqrt{x+1}}{2}=5`, {
    top: 'The numerator is the square root of x plus 1.',
    bottom: 'The denominator is 2.',
    root: 'The part under the root is x plus 1.',
    left: 'The left side is the fraction with numerator the square root of x plus 1, end root and denominator 2.',
    right: 'The right side is 5.',
    leftTerms: oneLeft, rightTerms: oneRight, kind: 'An equation.',
  }],
  [String.raw`\frac{\frac{a}{b}}{c}+\frac{d}{e}`, {
    top: 'The numerator is the fraction with numerator a and denominator b.',
    bottom: 'The denominator is c.',
  }],
  ['(a+b)/(c-d)', {
    top: 'The numerator is open parenthesis a plus b, close parenthesis.',
    bottom: 'The denominator is open parenthesis c minus d, close parenthesis.',
    brackets: 'Inside the brackets: a plus b.',
  }],
  [String.raw`\sqrt[3]{\sqrt{x^2}}+y`, {
    root: 'The part under the root is the square root of x squared.',
    power: 'The exponent is 2.',
  }],
  [String.raw`x^3-2x+1\le y+z`, {
    power: 'The exponent is 3.',
    left: 'The left side is x cubed minus 2 x plus 1.',
    right: 'The right side is y plus z.',
    leftTerms: 'There are 3 terms on the left.',
    rightTerms: 'There are 2 terms on the right.',
    kind: 'An inequality: less than or equal to.',
  }],
  [String.raw`-x_1^{n+1}\pm4=2\cdot y-1`, {
    power: 'The exponent is n plus 1.',
    left: 'The left side is negative x sub 1 to the power of n plus 1, end exponent plus or minus 4.',
    right: 'The right side is 2 times y minus 1.',
    leftTerms: 'There are 2 terms on the left.',
    rightTerms: 'There are 2 terms on the right.',
    kind: 'An equation.',
  }],
  [String.raw`\left[2x+(y-1)\right]^3\ge\pi`, {
    power: 'The exponent is 3.',
    brackets: 'Inside the brackets: 2 x plus open parenthesis y minus 1, close parenthesis.',
    left: 'The left side is open bracket 2 x plus open parenthesis y minus 1, close parenthesis, close bracket cubed.',
    right: 'The right side is pi.',
    leftTerms: oneLeft, rightTerms: oneRight,
    kind: 'An inequality: greater than or equal to.',
  }],
  [String.raw`3\times\sin(\pi)\ne\cos x`, {
    brackets: 'Inside the brackets: pi.',
    left: 'The left side is 3 times sine of open parenthesis pi, close parenthesis.',
    right: 'The right side is cosine of x.',
    leftTerms: oneLeft, rightTerms: oneRight,
    kind: 'An inequality: not equal to.',
  }],
  [String.raw`\tan x-\log{x}>\ln y`, {
    left: 'The left side is tangent of x minus logarithm of x.',
    right: 'The right side is natural logarithm of y.',
    leftTerms: 'There are 2 terms on the left.', rightTerms: oneRight,
    kind: 'An inequality: greater than.',
  }],
  ['(-x)^2+4', {
    power: 'The exponent is 2.',
    brackets: 'Inside the brackets: negative x.',
  }],
  ['2x + 3 = 11', {
    left: 'The left side is 2 x plus 3.',
    right: 'The right side is 11.',
    leftTerms: 'There are 2 terms on the left.', rightTerms: oneRight,
    kind: 'An equation.',
  }],
  ['\\pm x < 0.5', {
    left: 'The left side is plus or minus x.',
    right: 'The right side is 0.5.',
    leftTerms: oneLeft, rightTerms: oneRight, kind: 'An inequality: less than.',
  }],
];

test.describe('@smoke questions about written maths', () => {
  for (const [latex, answers] of samples) {
    test(latex, () => {
      expect(parseLine(latex)).not.toBeNull();
      for (const [part, phrasings] of questions) {
        for (const question of phrasings) {
          expect(askAbout(question, latex), question).toBe(answers[part] ?? absent[part]);
        }
      }
    });
  }

  test('declines unfinished or unsupported notation', () => {
    for (const latex of ['', 'x=', 'x^', 'x^^2', 'x^2^3', 'a/bc', 'a/b/c', 'x<y<z',
      '\\sqrt[3]{x', '\\left(x]', '\\text{Solve for x}', '\\int{x}', 'x,+1']) {
      expect(parseLine(latex), latex).toBeNull();
      expect(askAbout('numerator', latex)).toBe('I could not read the structure of this line.');
    }
  });

  test('keeps unrelated talk for the caller', () => {
    for (const question of ['what does numerator mean?', 'how do I solve this?', 'what is x?',
      'what is an exponent?', 'is the left side true?', 'x squared', 'this']) {
      expect(askAbout(question, 'x^2=4'), question).toBeNull();
    }
  });

  test('a script uses one TeX token unless it is grouped', () => {
    expect(askAbout("what's the power?", 'x^12')).toBe('The exponent is 1.');
    expect(askAbout("what's the power?", 'x^{12}')).toBe('The exponent is 12.');
  });
});
