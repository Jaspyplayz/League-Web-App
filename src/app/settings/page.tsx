import { redirect } from "next/navigation";

// Settings only ever held the theme, which is now the header's sun and moon
// switch (JAS-79), so old links and bookmarks go to home. The page can come
// back if there are ever more settings to keep.
export default function SettingsPage() {
  redirect("/");
}
