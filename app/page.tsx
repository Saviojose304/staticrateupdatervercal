import { redirect } from "next/navigation";

// The site root simply forwards to the public rate page.
export default function Home() {
  redirect("/rate");
}
