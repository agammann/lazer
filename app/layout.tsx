import type { Metadata } from "next"; import "./globals.css";
export const metadata: Metadata = {title:"Lazer | Bitcoin Derivatives Lab",description:"An independent Bitcoin derivatives test market with satoshi margin, Alice and Bob, and Lightning funding development.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body>{children}</body></html>}
