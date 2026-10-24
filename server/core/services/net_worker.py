#!/usr/bin/env python3
"""جانشین pg_net: درخواست‌هایی که پایگاه داده با net.http_post در صف گذاشته را می‌فرستد
و پاسخ را در net._http_response می‌نویسد (همان جدولی که sms_status و sms_test_result می‌خوانند).

فقط به میزبان‌های net_allow.txt (مثلاً وب‌سرویس پیامک)؛ بقیه با خطای «مجاز نیست» ثبت
می‌شوند — تا کارهای زمان‌بندی قدیمی که هنوز نشانی Supabase را دارند چیزی بیرون نفرستند.
"""
import json
import os
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srvlib as S  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
HEARTBEAT = os.environ.get("JARYAN_NET_HEARTBEAT", S.ROOT + "/run/jaryan-net/alive")
MAX_CONTENT = 100_000

FETCH = """
with d as (
  delete from net.http_request_queue
   where id in (select id from net.http_request_queue order by id limit 10 for update skip locked)
  returning *)
select coalesce(json_agg(d order by d.id), '[]') from d;
"""


def allowed_hosts():
    hosts = set()
    for path in (os.path.join(HERE, "net_allow.txt"), S.ETC + "/net-allow.txt"):
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.split("#", 1)[0].strip().lower()
                    if line:
                        hosts.add(line)
        except OSError:
            pass
    return hosts


def send(req, hosts):
    url = req["url"]
    params = req.get("params") or {}
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: str(v) for k, v in params.items()})
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    res = {"id": req["id"], "status_code": None, "content_type": None, "headers": None,
           "content": None, "timed_out": False, "error_msg": None}
    if urllib.parse.urlsplit(url).scheme not in ("http", "https") or host not in hosts:
        res["error_msg"] = f"blocked: host not allowed on this server ({host})"
        return res
    headers = {k: str(v) for k, v in (req.get("headers") or {}).items()}
    data = None
    if req["method"] == "POST":
        data = json.dumps(req.get("body") if req.get("body") is not None else {}, ensure_ascii=False).encode()
        headers.setdefault("Content-Type", "application/json")
    timeout = max(1, (req.get("timeout_milliseconds") or 5000) / 1000)
    r = urllib.request.Request(url, data=data, headers=headers, method=req["method"])
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            body = resp.read(MAX_CONTENT)
            res.update(status_code=resp.status, content_type=resp.headers.get("Content-Type"),
                       headers=dict(resp.headers.items()))
    except urllib.error.HTTPError as e:
        body = e.read(MAX_CONTENT)
        res.update(status_code=e.code, content_type=e.headers.get("Content-Type"), headers=dict(e.headers.items()))
    except TimeoutError:
        res.update(timed_out=True, error_msg="Timeout")
        return res
    except (urllib.error.URLError, OSError) as e:
        reason = getattr(e, "reason", e)
        res.update(timed_out="timed out" in str(reason), error_msg=str(reason)[:500])
        return res
    res["content"] = body.decode("utf-8", "replace")
    return res


def store(res):
    S.psql("insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg) "
           f"select id, status_code, content_type, headers, content, timed_out, error_msg "
           f"from jsonb_populate_record(null::net._http_response, {S.jlit(res)}) on conflict (id) do nothing")


def beat():
    try:
        os.makedirs(os.path.dirname(HEARTBEAT), exist_ok=True)
        with open(HEARTBEAT, "w") as f:
            f.write(str(int(time.time())))
    except OSError:
        pass


def main():
    stop = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(1))
    hosts, hosts_at = allowed_hosts(), time.time()
    once = "--once" in sys.argv
    while not stop:
        if time.time() - hosts_at > 60:
            hosts, hosts_at = allowed_hosts(), time.time()
        try:
            batch = json.loads(S.psql(FETCH).strip() or "[]")
            for req in batch:
                store(send(req, hosts))
            beat()
        except Exception as e:  # noqa: BLE001 — پایگاه داده موقتاً در دسترس نیست؛ دوباره
            print("net_worker:", str(e)[:300], file=sys.stderr, flush=True)
            batch = []
            time.sleep(4)
        if once:
            break
        if not batch:
            time.sleep(1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
