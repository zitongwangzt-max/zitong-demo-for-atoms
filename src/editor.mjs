import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { tags } from "@lezer/highlight";
import { format } from "prettier/standalone";
import * as htmlFormatting from "prettier/plugins/html";
import * as cssFormatting from "prettier/plugins/postcss";

const syntax = HighlightStyle.define([
  { tag: tags.tagName, color: "#234eae" },
  { tag: [tags.attributeName, tags.propertyName], color: "#743b9d" },
  { tag: [tags.string, tags.attributeValue], color: "#246047" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "#943668" },
  { tag: [tags.number, tags.color, tags.className], color: "#895013" },
  { tag: [tags.keyword, tags.meta, tags.atom], color: "#12617a" },
  { tag: [tags.angleBracket, tags.punctuation], color: "var(--faint)" },
  { tag: tags.comment, color: "var(--faint)", fontStyle: "italic" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--text)", backgroundColor: "var(--panel)", fontSize: "0.875rem" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.65" },
  ".cm-content": { caretColor: "var(--accent)", paddingBlock: "10px" },
  ".cm-line": { paddingLeft: "12px", paddingRight: "12px" },
  ".cm-gutters": { color: "var(--faint)", backgroundColor: "var(--raised)", borderRight: "1px solid var(--line)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--accent-soft)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused": { outline: "1px solid var(--accent)", outlineOffset: "-1px" },
}, { dark: false });

export function create(parent, source, onChange) {
  const extensions = [
    basicSetup,
    html(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": "HTML 源码", autocapitalize: "off", spellcheck: "false" }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    theme,
    syntaxHighlighting(syntax),
  ];
  const view = new EditorView({ doc: source, extensions, parent });
  return {
    setSource(text) {
      if (text !== view.state.doc.toString()) view.setState(EditorState.create({ doc: text, extensions }));
    },
    measure() {
      view.requestMeasure();
    },
    async format() {
      const currentDoc = view.state.doc;
      const text = currentDoc.toString();
      const formatted = await format(text, {
        parser: "html",
        plugins: [htmlFormatting, cssFormatting],
        tabWidth: 2,
        printWidth: 100,
      });
      if (view.state.doc === currentDoc && formatted !== text) {
        view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: formatted }, userEvent: "input.format" });
      }
    },
  };
}
