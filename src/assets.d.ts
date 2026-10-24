// `import text from './file.html?raw'` gives the file contents as a string.
declare module '*?raw' {
  const text: string;
  export default text;
}
