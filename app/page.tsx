import ExcuseApp from "@/components/ExcuseApp";
import ValleyBackground from "@/components/ValleyBackground";

// 핑계봇 첫 화면 (DESIGN 1장 ①제목 · ②한 줄 설명 + 입력 영역)
// 디자인: Fernhollow의 밤 꽃 계곡 스타일 — 가운데 큰 제목, 크림색 글씨, 반투명 유리 패널
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-10 px-5 py-12 sm:py-20">
      {/* 맨 뒤에 고정된 3D 밤 꽃 계곡 배경 */}
      <ValleyBackground />
      <header className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-[clamp(56px,13vw,104px)] leading-[0.95] font-medium tracking-[-0.03em] text-cream">
          핑계봇
        </h1>
        <p className="text-[clamp(16px,2.4vw,20px)] leading-[1.3] text-cream/70">
          지각할 때, 상사에게 보낼 메시지를 1분 안에
        </p>
      </header>

      {/* 입력·결과가 들어가는 유리 패널: 어두운 반투명 + 얇은 크림색 테두리 + 은은한 보랏빛 번짐 */}
      <div className="flex flex-col gap-8 rounded-[28px] border border-cream/15 bg-black/45 p-6 shadow-[0_0_80px_rgba(130,90,220,0.12)] backdrop-blur-md sm:p-9">
        <ExcuseApp />
      </div>
    </main>
  );
}
