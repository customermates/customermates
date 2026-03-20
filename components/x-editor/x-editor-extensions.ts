import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

export const baseExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2],
    },
  }),
  TaskList,
  TaskItem,
];

export const editorSchema = getSchema(baseExtensions);
