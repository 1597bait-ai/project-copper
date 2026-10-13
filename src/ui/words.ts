// Counts in words, for texts that follow tuned numbers ("THREE WARNINGS", "caught you twice").

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "three" for 3; digits past ten. */
export const numberWord = (n: number): string => WORDS[n] ?? String(n);

/** "once", "twice", "three times". */
export const timesWord = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${numberWord(n)} times`);
