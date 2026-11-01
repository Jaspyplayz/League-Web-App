const RIOT_HOST = /api\.riotgames\.com/;

// Next.js copies NEXT_PUBLIC_* vars into the browser bundle on purpose, and
// these two only say how and where the code runs, so none of them is a secret.
const PUBLIC_ENV_NAMES = new Set(["NODE_ENV", "NEXT_RUNTIME"]);

// The shade number is required so the rank name "Emerald" doesn't match.
const GREEN_CLASS = /\b(?:green|emerald|lime)-(?:50|[1-9]00|950)\b/;

const noRiotApiHost = {
  meta: {
    type: "problem",
    messages: {
      riotHost:
        "Riot API hosts belong in src/lib/riot/. Call Riot through src/lib/riot/client.ts so the rate limiter sees every request.",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && RIOT_HOST.test(node.value)) {
          context.report({ node, messageId: "riotHost" });
        }
      },
      TemplateElement(node) {
        if (RIOT_HOST.test(node.value.raw)) context.report({ node, messageId: "riotHost" });
      },
    };
  },
};

const serverOnlyEnv = {
  meta: {
    type: "problem",
    messages: {
      secretEnv:
        'Reads {{name}} without import "server-only". Add that import so a page can\'t bundle the secret into the browser.',
    },
    schema: [],
  },
  create(context) {
    const importsServerOnly = context.sourceCode.ast.body.some(
      (node) => node.type === "ImportDeclaration" && node.source.value === "server-only",
    );
    if (importsServerOnly) return {};

    // null when the code doesn't spell the name out, as in process.env[name].
    // That could be any var, so it counts as a secret.
    const keyName = (key, computed) => {
      if (key.type === "Literal") return typeof key.value === "string" ? key.value : null;
      return !computed && key.type === "Identifier" ? key.name : null;
    };
    const reportUnlessPublic = (node, name) => {
      if (name !== null && (name.startsWith("NEXT_PUBLIC_") || PUBLIC_ENV_NAMES.has(name))) return;
      const shown = name === null ? "process.env" : `process.env.${name}`;
      context.report({ node, messageId: "secretEnv", data: { name: shown } });
    };

    return {
      MemberExpression(node) {
        const isProcessEnv =
          node.object.type === "Identifier" &&
          node.object.name === "process" &&
          !node.computed &&
          node.property.name === "env";
        if (!isProcessEnv) return;

        const { parent } = node;
        if (parent.type === "MemberExpression" && parent.object === node) {
          reportUnlessPublic(parent, keyName(parent.property, parent.computed));
        } else if (parent.type === "VariableDeclarator" && parent.id.type === "ObjectPattern") {
          for (const prop of parent.id.properties) {
            reportUnlessPublic(prop, prop.type === "Property" ? keyName(prop.key, prop.computed) : null);
          }
        } else {
          reportUnlessPublic(node, null);
        }
      },
    };
  },
};

const noGreenClasses = {
  meta: {
    type: "problem",
    messages: {
      greenClass:
        "The site uses blue and red, never green and red, so color-blind players can tell them apart. Use blue or a theme token such as text-ahead (see .claude/rules/design.md).",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && GREEN_CLASS.test(node.value)) {
          context.report({ node, messageId: "greenClass" });
        }
      },
      TemplateElement(node) {
        if (GREEN_CLASS.test(node.value.raw)) context.report({ node, messageId: "greenClass" });
      },
    };
  },
};

// A class list never starts with a capital, so this string is words for a person.
const SENTENCE = /^[A-Z]/;

// Calls check(node, text) for every string and template piece in a file, which
// is where class names live. Comments and JSX text aren't checked.
function everyString(check) {
  return {
    Literal(node) {
      if (typeof node.value === "string") check(node, node.value);
    },
    TemplateElement(node) {
      check(node, node.value.raw);
    },
  };
}

// The Review board's type (JAS-94): Rubik only, sentence case. Each entry names
// its fix so the error says what to do. "(?<![\w-])" lets a variant such as
// "hover:" come first but not a longer name ending the same way. Each also
// covers Tailwind's other ways to write the same thing, such as [font-size:13px].
const OLD_TYPE = [
  {
    pattern: /(?<![\w-])uppercase(?![\w-])/,
    found: "uppercase",
    fix: "write the words in sentence case",
    // "Include an uppercase letter" is a word in a sentence, not the class.
    isAlsoAWord: true,
  },
  {
    // A negative value is fine: the page titles sit slightly tighter.
    pattern: /(?<![\w-])tracking-(?:wide(?:r|st)?(?![\w-])|\[(?!-)|\()|\[letter-spacing:/,
    found: "wide letter spacing",
    fix: "remove it, since it was only for all-caps labels",
  },
  { pattern: /(?<![\w-])font-mono(?![\w-])/, found: "font-mono", fix: "use tabular-nums for numbers" },
  {
    // font-[600] is a weight, not a font.
    pattern: /(?<![\w-])font-(?:display(?![\w-])|serif(?![\w-])|\[(?!\d)|\(family-name:)|\[font-family:/,
    found: "second font",
    fix: "remove it, since Rubik is the only font",
  },
  { pattern: /(?<![\w-])text-label(?![\w-])/, found: "text-label", fix: "use text-note" },
  {
    pattern: /(?<![\w-])text-(?:\[(?:length:|[\d.])|\(length:)|\[font-size:/,
    found: "made-up text size",
    fix: "use text-title, text-heading, text-subheading, text-body, text-note or a Tailwind size",
  },
];

// The same type set without a class: SVG attributes and style keys. fontSize
// stays allowed, since the charts draw their labels in SVG.
const INLINE_TYPE = new Set(["fontFamily", "letterSpacing", "textTransform"]);
// The browser draws these in a monospace font unless a class says otherwise.
const MONOSPACE_TAGS = new Set(["code", "kbd", "pre", "samp"]);

const reviewBoardType = {
  meta: {
    type: "problem",
    messages: {
      oldType: "The Review board has no {{found}}: {{fix}} (see .claude/rules/design.md).",
    },
    schema: [],
  },
  create(context) {
    const reportInline = (node, name) =>
      context.report({
        node,
        messageId: "oldType",
        data: { found: `inline ${name}`, fix: "remove it, since every page is Rubik in sentence case" },
      });
    return {
      ...everyString((node, text) => {
        const isSentence = SENTENCE.test(text);
        for (const { pattern, found, fix, isAlsoAWord } of OLD_TYPE) {
          if (isAlsoAWord && isSentence) continue;
          if (pattern.test(text)) context.report({ node, messageId: "oldType", data: { found, fix } });
        }
      }),
      JSXAttribute(node) {
        if (INLINE_TYPE.has(node.name.name)) reportInline(node, node.name.name);
      },
      Property(node) {
        if (!node.computed && INLINE_TYPE.has(node.key.name ?? node.key.value)) {
          reportInline(node, node.key.name ?? node.key.value);
        }
      },
      JSXOpeningElement(node) {
        if (MONOSPACE_TAGS.has(node.name.name)) {
          context.report({
            node,
            messageId: "oldType",
            data: { found: `<${node.name.name}>`, fix: "use a span with tabular-nums, since the browser draws this tag in a monospace font" },
          });
        }
      },
    };
  },
};

// The lookbehind skips a Riot ID's tag ("Faker#123") and an HTML entity ("&#123;").
// "_" is allowed on both sides, since it's how Tailwind writes a space inside
// [box-shadow:0_0_#123456]. Three or four characters can also be a rank in a
// sentence ("Rank #123") or a link to an SVG gradient ("url(#fade)").
const LONG_HEX = /(?<![&a-z0-9])#(?:[0-9a-f]{8}|[0-9a-f]{6})(?![a-z0-9-])/i;
const SHORT_HEX = /(?<![&a-z0-9]|url\()#[0-9a-f]{3,4}(?![a-z0-9-])/i;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

function hasRawColour(text) {
  return LONG_HEX.test(text) || COLOUR_FUNCTION.test(text) || (!SENTENCE.test(text) && SHORT_HEX.test(text));
}

// Tailwind builds no CSS for a colour that doesn't exist, so one of these
// wouldn't fail anywhere: the text or fill would quietly stop being drawn.
const OLD_COLOURS = {
  surface: "panel",
  "surface-hover": "select for a hover or selected row, raised for a fill inside a panel",
  line: "divider",
  "line-strong": "divider",
  frame: "no border, since panels have none",
  ink: "main",
  "ink-soft": "main",
  muted: "quiet",
  faint: "quiet",
};
// Tailwind's colour utilities. "border" can name a side or corner first.
const COLOUR_UTILITY =
  "bg|text|border(?:-[a-z]+)?|divide|ring|ring-offset|inset-ring|shadow|inset-shadow|drop-shadow|text-shadow|fill|stroke|outline|decoration|accent|caret|placeholder|from|via|to";
const OLD_COLOUR = new RegExp(
  `(?<![\\w-])(?:(?:${COLOUR_UTILITY})-|--color-)(${Object.keys(OLD_COLOURS).join("|")})(?![\\w-])`,
);
// Tailwind's own colours draw, but don't follow the theme switch. Green, emerald
// and lime are left to no-green-classes, which says why.
const PALETTE_COLOUR = new RegExp(
  `(?<![\\w-])(?:${COLOUR_UTILITY})-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950))(?![\\w-])`,
);

const tokensOnly = {
  meta: {
    type: "problem",
    messages: {
      rawColour:
        "Colours come from the tokens in src/app/globals.css, so they follow the theme switch. Use one such as bg-panel or text-main (see .claude/rules/design.md).",
      oldColour: "--color-{{name}} no longer exists, so this class draws nothing. Use {{fix}} (see .claude/rules/design.md).",
    },
    schema: [],
  },
  create(context) {
    return everyString((node, text) => {
      if (hasRawColour(text) || PALETTE_COLOUR.test(text)) context.report({ node, messageId: "rawColour" });
      const name = OLD_COLOUR.exec(text)?.[1];
      if (name) context.report({ node, messageId: "oldColour", data: { name, fix: OLD_COLOURS[name] } });
    });
  },
};

const turnpoint = {
  rules: {
    "no-riot-api-host": noRiotApiHost,
    "server-only-env": serverOnlyEnv,
    "no-green-classes": noGreenClasses,
    "review-board-type": reviewBoardType,
    "tokens-only": tokensOnly,
  },
};

export default turnpoint;
