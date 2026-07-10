export default function Home() {
  return (
    // Fills the flex column from layout.tsx and centers the lockup.
    // Page background + default body font come from globals.css (brand tokens).
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {/* Wordmark — display serif (Cormorant Garamond), GOLD per readme.md:
          display-serif titles + the VELOURA wordmark render in --text-gold (#9C7B3C). */}
      <h1 className="font-display text-display-2xl uppercase text-text-accent">
        Veloura
      </h1>

      {/* "by CM" — script font (Alex Brush), gold accent. Decorative lockup only. */}
      <p className="-mt-2 font-script text-script-lg text-text-accent">
        by CM
      </p>

      {/* Tagline — uppercase, letterspaced label token, muted text */}
      <p className="mt-6 text-label-base uppercase tracking-label text-text-secondary">
        Wear luxury, not the price.
      </p>
    </div>
  );
}
