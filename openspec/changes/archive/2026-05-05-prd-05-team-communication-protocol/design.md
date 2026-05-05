## Overview

PRD-05 在本地单机代理上引入“团队通信层”。实现由 `TeamManager` 负责，底层持久化采用 `.team/inbox/*.jsonl` 与 `.team/requests.json`。

## Data model

- teammate: `id/name/status(working|idle|shutdown)/updatedAt`
- message: `id/from/to/type/content/request_id?/createdAt`
- request: `request_id/type/from/to/status(pending|approved|rejected)/payload/updatedAt`

## Storage

- inbox: `.team/inbox/<teammateId>.jsonl`
- requests: `.team/requests.json`
- teammates: `.team/teammates.json`

## Tools

- `team_add_teammate`
- `team_set_status`
- `team_message`
- `team_broadcast`
- `team_shutdown_request`
- `team_shutdown_response`
- `team_plan_approval_request`
- `team_plan_approval_response`
- `team_list_teammates`
- `team_read_inbox`
- `team_list_requests`

## Protocol constraints

- 所有协议请求和响应都必须有 `request_id`。
- 响应必须引用已存在且 `pending` 的请求。
- 响应后请求状态更新为 `approved/rejected`。

## Main loop integration

- 每轮前 drain 团队消息通知，注入 system 提示，便于主代理在下一轮感知团队动态。
