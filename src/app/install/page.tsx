import type { Metadata } from "next";
import InstallGuide from "./InstallGuide";
import "./install.css";

export const metadata: Metadata = { title: "Install the AFTERLIFE app", robots: { index: false } };

export default function InstallPage() {
  return <InstallGuide />;
}
