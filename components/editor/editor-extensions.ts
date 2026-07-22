import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";

import { ImageWithLinkFallback } from "./image-extension";

export const baseExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2],
    },
  }),
  TaskList,
  TaskItem,
  ImageWithLinkFallback.configure({ inline: true }),
  TableKit,
];

export const editorSchema = getSchema(baseExtensions);
