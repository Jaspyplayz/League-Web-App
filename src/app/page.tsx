import { SearchForm } from "@/components/search-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Find out why you won or lost
        </h1>
        <p className="mx-auto max-w-lg text-lg text-zinc-600 dark:text-zinc-400">
          Look up any League of Legends player and see, minute by minute, where each game
          turned.
        </p>
      </div>
      <SearchForm />
    </main>
  );
}
