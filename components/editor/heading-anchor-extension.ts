import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export function headingAnchorId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export function headingAnchors(prefix: string) {
  return Extension.create({
    name: "headingAnchors",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, position) => {
                if (node.type.name !== "heading") return true;
                decorations.push(
                  Decoration.node(position, position + node.nodeSize, {
                    id: headingAnchorId(prefix, decorations.length),
                  }),
                );
                return false;
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}
