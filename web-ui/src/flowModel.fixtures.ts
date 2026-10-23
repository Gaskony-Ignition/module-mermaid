// Invented definitions in the style of generated documentation diagrams: a long init
// directive, HTML labels, many classDefs, class lists, side links to list nodes and deep call
// trees. The ER diagram is there to check that a non-flowchart is refused.

export interface CorpusItem {
  name: string;
  definition: string;
}

const INIT =
  '%%{init: {"theme": "base", "themeVariables": {"background": "transparent", "primaryColor": "#1d242c", ' +
  '"primaryTextColor": "#e6eaef", "primaryBorderColor": "#98a3b0", "lineColor": "#7d8896", "textColor": "#e6eaef", ' +
  '"fontSize": "14px", "clusterBkg": "transparent", "clusterBorder": "#2e3742"}, ' +
  '"themeCSS": ".row-rect-odd path:first-child { fill: #20262e; } .row-rect-even path:first-child { fill: #2a323c; } ' +
  '.attribute-name .nodeLabel, .attribute-type .nodeLabel { color: #e6eaef; }", ' +
  '"fontFamily": "\\"JetBrains Mono\\",\\"IBM Plex Mono\\",Menlo,Consolas,monospace", ' +
  '"flowchart": {"curve": "basis", "nodeSpacing": 34, "rankSpacing": 52, "padding": 8, "useMaxWidth": true}}}%%';

export const ER_DEFINITION: CorpusItem = {
  name: 'ER diagram',
  definition: `${INIT}
erDiagram
  orders {
    bigserial id PK
    text customer
    timestamptz placed_at
    text status "null"
  }
  invoices {
    text id PK
    bigint order_id FK
    numeric total
  }
  invoices }o--|| orders : order_id`,
};

export const SAMPLE_DEFINITIONS: CorpusItem[] = [
  {
    name: 'plant goals',
    definition: `${INIT}
flowchart TB
  purpose["<b>plant</b>"]
  leg0["Fill the storage tank<br/>(built)"]
  purpose --> leg0
  leg1["Run the duty pump<br/>(4 of 6 steps built)"]
  purpose --> leg1
  leg2["Alarm on high level<br/>(v1)"]
  purpose --> leg2
  leg3["Report daily flow<br/>(v1)"]
  purpose --> leg3
  classDef purposeNode stroke:#6fb7d1,stroke-width:2px
  class purpose purposeNode
  classDef built stroke:#7bbf7f,stroke-width:2px
  classDef partly stroke:#7bbf7f,stroke-width:2px,stroke-dasharray:6 3
  classDef v1 stroke:#98a3b0,stroke-width:2px,stroke-dasharray:6 3
  classDef undefined stroke:#5c6672,stroke-width:2px,stroke-dasharray:3 3
  class leg0 built
  class leg1 partly
  class leg2,leg3 v1`,
  },
  {
    name: 'controller modules',
    definition: `${INIT}
flowchart TB
  controller["controller"]
  common_io["common.io"]
  common_settings["common.settings"]
  common_timer["common.timer"]
  common_store["common.store"]
  controller --> common_io
  controller --> common_settings
  controller --> common_timer
  common_timer --> common_store
  classDef controller stroke:#6fb7d1,stroke-width:2px
  class controller controller
  classDef common_io stroke:#a98cd1,stroke-width:2px
  class common_io common_io
  classDef common_settings stroke:#d18aa6,stroke-width:2px
  class common_settings common_settings
  classDef common_timer stroke:#82a6d6,stroke-width:2px
  class common_timer common_timer
  classDef common_store stroke:#7bbf7f,stroke-width:2px
  class common_store common_store
  settings_list["<b>Controller</b><br/>  PumpSetpoint<br/>  TankHighLevel<br/>  TankLowLevel"]
  common_settings -.- settings_list
  classDef settingsList stroke:#d18aa6,stroke-dasharray:4 3,text-align:left
  class settings_list settingsList`,
  },
  {
    name: 'pump call tree',
    definition: `${INIT}
flowchart TB
  pump_runDuty["pump.runDuty"]
  pump_runDuty --> pump_checkLevel
  pump_checkLevel["pump.checkLevel"]
  pump_checkLevel --> tank_readLevel
  tank_readLevel["tank.readLevel"]
  tank_readLevel --> common_io_read
  common_io_read["common.io.read"]
  tank_readLevel --> tank_readLevel__common_store
  tank_readLevel__common_store["<b>common.store</b><br/>  .get<br/>  .put"]
  pump_checkLevel --> common_settings_get
  common_settings_get["common.settings.get"]
  pump_runDuty --> pump_start
  pump_start["pump.start"]
  pump_start --> common_io_write
  common_io_write["common.io.write"]
  pump_start --> common_settings_get
  pump_start --> common_timer_every
  common_timer_every["common.timer.every"]
  common_timer_every --> common_timer_run
  common_timer_run["common.timer.run"]
  common_timer_run --> common_timer_run__common_store
  common_timer_run__common_store["<b>common.store</b><br/>  .begin<br/>  .end<br/>  .last"]
  common_timer_run --> common_io_read
  classDef callList text-align:left
  class tank_readLevel__common_store,common_timer_run__common_store callList
  classDef pump stroke:#6fb7d1,stroke-width:2px
  class pump_checkLevel,pump_runDuty,pump_start pump
  classDef tank stroke:#d18b5c,stroke-width:2px
  class tank_readLevel tank
  classDef common_io stroke:#a98cd1,stroke-width:2px
  class common_io_read,common_io_write common_io
  classDef common_settings stroke:#d18aa6,stroke-width:2px
  class common_settings_get common_settings
  classDef common_timer stroke:#82a6d6,stroke-width:2px
  class common_timer_every,common_timer_run common_timer
  classDef common_store stroke:#7bbf7f,stroke-width:2px
  class tank_readLevel__common_store,common_timer_run__common_store common_store`,
  },
  {
    name: 'order flow',
    definition: `${INIT}
flowchart LR
  order["Customer order"] -->|checked against| stock["Stock on hand"]
  order -->|becomes| pick["Pick list"]
  pick -->|shipped as| ship["Shipment"]
  ship -->|billed on| inv["Invoice"]
  inv -->|paid by| pay["Payment"]
  inv -.->|reminder| mail["Email"]`,
  },
  ER_DEFINITION,
];
