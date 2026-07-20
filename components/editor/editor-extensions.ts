import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";

export const baseExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2],
    },
  }),
  TaskList,
  TaskItem,
  Image.configure({ inline: true }),
  TableKit,
];

export const editorSchema = getSchema(baseExtensions);
