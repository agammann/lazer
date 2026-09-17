import type { Metadata } from "next"; import "./globals.css";
export const metadata: Metadata = {title:"Lazer | Bitcoin Testnet 4 Terminal",description:"Alice and Bob trade Bitcoin against simulated dollars, with Bitcoin Core payments and Testnet 4 verification.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body>{children}</body></html>}
