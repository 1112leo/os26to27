import { Link, useLocation } from 'react-router-dom';

export default function CompletePage() {
  const location = useLocation();
  let previous: string | null = null;
  try { previous = sessionStorage.getItem('ohsung-last-receipt'); } catch { /* Optional receipt only. */ }
  const receipt = (location.state as { receiptId?: string } | null)?.receiptId ?? previous;
  return <section className="panel completion">
    <p className="eyebrow">{receipt ? '접수 완료' : '접수 확인'}</p>
    <h1>{receipt ? '당신의 이야기를 잘 받았어요.' : '이 화면에서는 접수 내역을 확인할 수 없습니다.'}</h1>
    {receipt ? <><p>글이 데이터베이스에 저장되었습니다. 운영진이 검토한 뒤 공개할 수 있습니다. 접수 완료는 공개 승인을 의미하지 않습니다.</p><p className="muted">접수번호 <code>{receipt}</code></p></> : <p>글 작성 화면에서 제출을 완료해 주세요.</p>}
    <div className="actions"><Link className="button primary" to="/">메인으로</Link><Link className="button" to="/write">새 글 작성하기</Link></div>
  </section>;
}
