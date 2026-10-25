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

const turnpoint = {
  rules: {
    "no-riot-api-host": noRiotApiHost,
    "server-only-env": serverOnlyEnv,
    "no-green-classes": noGreenClasses,
  },
};

export default turnpoint;
