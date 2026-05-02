workspace "AI Infra Target Architecture" "Target architecture for a small local-checkout LangGraph/LangChain modular-monolith agent runtime starter slice." {

    model {
        user = person "Chat user" "A person who interacts with a starter agent through a chat channel."
        maintainer = person "Maintainer" "Operates the stack and deploys versioned changes from the local checkout."

        agentRuntime = softwareSystem "Agent Runtime" "Modular-monolith runtime that routes channel messages to local versioned scratch and carshare agent systems, executes synchronous LangGraph/LangChain workflows, and integrates with separately deployed services." {
            agentRuntimeApp = container "Agent Runtime App" "DIY modular monolith for channel adapters, routing, sessions, synchronous graph execution, goal-directed agent harnessing, one-shot LLM call hosting, permission policy, local configuration loading, tool/model clients, and runtime persistence." "Application container using LangGraph, LangChain, and DeepAgents" {
                telegramAdapter = component "Telegram Adapter" "Receives Telegram updates, normalizes channel identity, and sends Telegram responses." "Telegram Bot API adapter"
                discordAdapter = component "Discord Adapter" "Receives Discord events when configured, normalizes channel identity, and sends Discord responses." "Discord API adapter"
                messageNormalizer = component "Message Normalizer" "Converts channel-specific events into runtime message envelopes with sender, chat, and message identity." "Application component"
                messageRouter = component "Message Router" "Selects the configured starter agent system for a channel and session." "Application component"
                sessionManager = component "Session Manager" "Manages channel bindings, session metadata, message records, run records, and conversational continuity." "Application component"
                agentSystemLoader = component "Agent System Loader" "Loads scratch and carshare agent-system graph definitions, prompts, permissions, and tool configuration from the deployed local checkout." "Local config loader"
                graphRunner = component "Graph Runner" "Runs selected LangGraph graphs synchronously per message and follows graph edges without checkpoint/resume support in the starter slice." "LangGraph"
                agentHarness = component "Goal-Directed Agent Harness" "Runs DeepAgents goal-directed LLM/tool loops for true agent graph nodes while the runtime keeps routing, permission, idempotency, audit, model, and tool boundaries around each run." "DeepAgents"
                oneShotLlmCallHost = component "One-Shot LLM Call Host" "Hosts single prompt/model calls that are not goal-directed agents and do not run an iterative tool loop." "LangChain/model call host"
                modelClient = component "Model Client" "Calls AWS Bedrock directly for initial model integration." "AWS Bedrock provider clients"
                toolClientLayer = component "Tool Client Layer" "Provides HTTP clients for Carshare Service tools." "HTTP/API clients"
                permissionPolicy = component "Permission Policy" "Evaluates configured tool allowlists and side-effect classes before tool execution." "Policy component"

                scratchGraph = component "Scratch Chat Graph" "Configured graph from agent-systems/scratch/graph.yaml for direct assistant chat." "Versioned graph configuration"
                scratchLlmCall = component "Scratch LLM Call" "Configured one-shot assistant model call hosted by the runtime; not a goal-directed agent loop or independently deployed service." "Prompt/configured graph node"
                carshareGraph = component "Carshare Graph" "Configured graph from agent-systems/carshare/graph.yaml for carshare routing to one Carshare Persistence Agent." "Versioned graph configuration"
                carsharePersistenceAgent = component "Carshare Persistence Agent" "Single goal-directed agent executed by DeepAgents for carshare persistence and query workflows; consumes DeepAgents-compatible skill instructions, gathers required fields, calls permitted Carshare Service tools through the Tool Client Layer, observes results, performs success read-backs, and continues until complete or blocked." "Goal-directed agent configuration"
                carshareApiSkill = component "Carshare API Skill/Instructions" "Versioned DeepAgents-compatible skill contract that tells the Carshare Persistence Agent which Carshare Service tool calls exist, required and optional bodies, validation constraints, clarification behavior, and success read-backs." "Versioned skill/instructions contract"
            }
            carshareService = container "Carshare Service" "Separate domain HTTP service that owns carshare projects, participants, driver intervals, handover fuel deltas, refills, obligations, ledger bookings, and settlements for agents and possible future non-agent clients." "Express HTTP service" {
                carshareHttpApi = component "Carshare HTTP API" "Express routes exposing health, project, participant, driver interval, handover fuel delta, obligation, refill, ledger booking, and settlement endpoints." "Express routes"
                carshareValidation = component "Request Validation and Participant Resolution" "Validates request fields, canonicalizes participant names, resolves active users, and maps validation or conflict errors to HTTP responses." "Application component"
                participantProjectManager = component "Project and Participant Manager" "Ensures projects and manages participant add, edit, and deactivate constraints." "Application service"
                driverIntervalManager = component "Driver Interval Manager" "Creates, edits, deletes, and lists possession intervals while deriving or maintaining Handover Fuel Deltas for adjacent explicit tank-liter mismatches." "Application service"
                replacementLedgerEngine = component "Replacement-Obligation Ledger Engine" "Recalculates interval-derived obligations and Handover Fuel Deltas, applies revised surplus lot ordering, fills own prior obligations before others, and creates cross-user ledger bookings." "Domain accounting component"
                refillObligationManager = component "Refill and Obligation Manager" "Manages manual obligations, refill lots, manual fills, Handover Fuel Delta list/accept/fill operations, and delegates recalculation to the ledger engine." "Application service"
                settlementManager = component "Settlement Manager" "Lists ledger bookings and groups unsettled ledger bookings into settlements." "Application service"
                carshareRepository = component "Carshare Repository and Transaction Boundary" "Wraps the Postgres pool, SQL queries, and transactions for Carshare-owned tables." "PostgreSQL data access"
            }
            postgres = container "Postgres" "Stores starter runtime channel bindings, sessions, messages, runs, tool invocation audit, and Carshare Service-owned domain data." "PostgreSQL/pgvector" "Database"
        }

        telegram = softwareSystem "Telegram" "External chat channel used by users and groups." "External System"
        discord = softwareSystem "Discord" "External chat channel with independently configured bindings; disabled unless configured." "External System"
        modelProviders = softwareSystem "External Model Providers" "Hosted LLM providers; initial runtime integration calls AWS Bedrock directly using configured Bedrock aliases." "External System"

        user -> telegram "Sends and receives bot messages" "Telegram client"
        user -> discord "Sends and receives bot messages" "Discord client"
        telegram -> user "Displays bot responses" "Telegram client"
        discord -> user "Displays bot responses" "Discord client"
        maintainer -> agentRuntimeApp "Deploys and operates the local-checkout runtime" "Operational access"

        telegram -> agentRuntimeApp "Delivers Telegram updates" "Telegram Bot API"
        discord -> agentRuntimeApp "Delivers Discord events when enabled" "Discord API"
        agentRuntimeApp -> telegram "Sends Telegram responses" "Telegram Bot API"
        agentRuntimeApp -> discord "Sends Discord responses when enabled" "Discord API"
        agentRuntimeApp -> carshareService "Calls carshare health, project, participant, driver interval, handover fuel delta, refill, obligation, ledger booking, and settlement endpoints" "HTTP/JSON"
        carshareService -> postgres "Owns carshare project, participant, driver interval, handover fuel delta, refill, obligation, ledger booking, and settlement data access" "SQL"
        agentRuntimeApp -> postgres "Persists runtime channel bindings, sessions, messages, runs, and tool invocation audit; does not write carshare domain tables during normal operation" "SQL"
        agentRuntimeApp -> modelProviders "Requests model completions directly for initial AWS Bedrock integration" "AWS Bedrock provider API"

        telegram -> telegramAdapter "Delivers Telegram updates to the adapter" "Telegram Bot API"
        telegramAdapter -> telegram "Sends Telegram responses through the Bot API" "Telegram Bot API"
        discord -> discordAdapter "Delivers Discord events to the adapter when enabled" "Discord API"
        discordAdapter -> discord "Sends Discord responses through the Discord API when enabled" "Discord API"
        telegramAdapter -> messageNormalizer "Submits Telegram update envelopes" "In-process call"
        discordAdapter -> messageNormalizer "Submits Discord event envelopes" "In-process call"
        messageNormalizer -> messageRouter "Provides normalized channel messages" "In-process call"
        messageRouter -> sessionManager "Reads channel binding and session context" "In-process call"
        messageRouter -> agentSystemLoader "Selects local versioned starter agent system definition" "In-process call"
        messageRouter -> graphRunner "Starts selected per-message graph run" "In-process call"
        sessionManager -> postgres "Persists channel bindings, sessions, messages, runs, and tool invocation audit" "SQL"
        graphRunner -> agentHarness "Starts DeepAgents runs when the selected graph routes to a true agent node" "In-process call"
        graphRunner -> oneShotLlmCallHost "Executes one-shot prompt/model steps when the selected graph routes to a prompt step" "In-process call"
        graphRunner -> permissionPolicy "Checks configured tool allowlist and side-effect class before tools" "In-process call"
        agentHarness -> modelClient "Requests model calls for DeepAgents loops through the runtime-owned model boundary" "In-process call"
        agentHarness -> toolClientLayer "Calls runtime-wrapped permitted tools and observes results through permission and audit boundaries" "In-process call"
        oneShotLlmCallHost -> modelClient "Requests single model completions for prompt steps" "In-process call"
        modelClient -> modelProviders "Calls models directly through AWS Bedrock initially" "AWS Bedrock provider API"
        toolClientLayer -> carshareService "Calls Carshare Service HTTP endpoints" "HTTP/JSON"

        graphRunner -> scratchGraph "Executes configured scratch chat graph" "LangGraph"
        scratchGraph -> scratchLlmCall "Runs one-shot assistant prompt step" "Graph edge"
        scratchLlmCall -> oneShotLlmCallHost "Requests a single LLM call" "In-process call"
        graphRunner -> carshareGraph "Executes configured carshare graph" "LangGraph"
        carshareGraph -> carsharePersistenceAgent "Target design routes persistence/query workflows to one goal-directed agent" "Graph edge"
        carshareGraph -> agentHarness "Starts a DeepAgents run for Carshare Persistence Agent workflows" "Graph edge"
        agentHarness -> carsharePersistenceAgent "Executes the Carshare Persistence Agent goal loop with DeepAgents" "In-process call"
        carsharePersistenceAgent -> carshareApiSkill "Consumes DeepAgents-compatible operation catalog, required body rules, and read-back instructions" "Skill contract"
        carsharePersistenceAgent -> toolClientLayer "Uses permitted Carshare Service tools for writes, reads, and success read-backs" "In-process tool calls"
        carsharePersistenceAgent -> telegramAdapter "Asks clarifying questions and returns final responses through the channel adapter" "In-process response event"

        toolClientLayer -> carshareHttpApi "Calls Carshare Service HTTP/JSON endpoints" "HTTP/JSON"
        carshareHttpApi -> carshareValidation "Validates and resolves request fields and users" "In-process call"
        carshareHttpApi -> participantProjectManager "Routes project and participant commands and queries" "In-process call"
        carshareHttpApi -> driverIntervalManager "Routes driver interval commands and queries" "In-process call"
        carshareHttpApi -> refillObligationManager "Routes handover fuel delta, obligation, refill, and fill commands and queries" "In-process call"
        carshareHttpApi -> settlementManager "Routes ledger booking and settlement commands and queries" "In-process call"
        participantProjectManager -> replacementLedgerEngine "Requests ledger recalculation after participant-affecting mutations" "In-process call"
        driverIntervalManager -> replacementLedgerEngine "Requests ledger recalculation and Handover Fuel Delta derivation after interval mutations" "In-process call"
        refillObligationManager -> replacementLedgerEngine "Requests ledger recalculation after handover fuel delta, obligation, refill, and fill mutations" "In-process call"
        carshareValidation -> carshareRepository "Reads project and participant data for validation and resolution" "SQL data access"
        participantProjectManager -> carshareRepository "Reads and writes project and participant records" "SQL data access"
        driverIntervalManager -> carshareRepository "Reads and writes driver interval records" "SQL data access"
        refillObligationManager -> carshareRepository "Reads and writes Handover Fuel Deltas, obligations, refill lots, manual fills, and related ledger state" "SQL data access"
        settlementManager -> carshareRepository "Reads ledger bookings and writes settlements" "SQL data access"
        replacementLedgerEngine -> carshareRepository "Rebuilds derived obligations, Handover Fuel Deltas, and bookings transactionally" "SQL transaction"
        carshareRepository -> postgres "Reads and writes Carshare-owned tables" "SQL"

        production = deploymentEnvironment "Production" {
            oracleCloud = deploymentNode "Oracle Cloud" "Cloud provider hosting the small self-managed stack." "OCI" {
                oracleVm = deploymentNode "Oracle VM" "Single Oracle Free Tier ARM VM." "VM.Standard.A1.Flex" {
                    docker = deploymentNode "Docker Compose" "Docker Compose project on the VM." "Docker" {
                        agentRuntimeAppInstance = containerInstance agentRuntimeApp
                        carshareServiceInstance = containerInstance carshareService
                        postgresInstance = containerInstance postgres
                    }
                }
            }
        }
    }

    views {
        systemContext agentRuntime "system-context" "System context for the thin starter modular-monolith agent runtime." {
            include *
            autolayout lr
        }

        container agentRuntime "container" "Containers in the starter agent runtime." {
            include *
            autolayout lr
        }

        component agentRuntimeApp "agent-runtime-app-components" "Internal modules and configured starter graph nodes hosted by the Agent Runtime App." {
            include *
            autolayout lr
        }

        component agentRuntimeApp "carshare-agent-graph" "Carshare graph with one goal-directed persistence agent using the Carshare API skill and Tool Client Layer." {
            include carshareGraph agentHarness carsharePersistenceAgent carshareApiSkill toolClientLayer carshareService postgres
            autolayout lr
        }

        component carshareService "carshare-service-components" "Internal responsibilities of the Carshare Service replacement-obligation implementation." {
            include *
            include toolClientLayer
            include postgres
            autolayout lr
        }

        dynamic agentRuntime "dynamic-message-response" "Message-to-response flow through the thin starter Agent Runtime App." {
            user -> telegram "1. Sends a message"
            telegram -> agentRuntimeApp "2. Delivers update"
            agentRuntimeApp -> postgres "3. Loads channel binding and session state"
            agentRuntimeApp -> modelProviders "4. Requests model completion when needed"
            agentRuntimeApp -> postgres "5. Stores message, run, and tool audit records"
            agentRuntimeApp -> telegram "6. Sends bot response"
            telegram -> user "7. Displays response"
            autolayout lr
        }

        dynamic agentRuntimeApp "dynamic-carshare-flow" "Target Carshare persistence/query flow through one goal-directed agent and the separate Carshare Service." {
            user -> telegram "1. Sends carshare request"
            telegram -> telegramAdapter "2. Delivers update"
            telegramAdapter -> messageNormalizer "3. Normalizes channel identity"
            messageNormalizer -> messageRouter "4. Routes to the carshare graph"
            messageRouter -> graphRunner "5. Starts per-message graph run"
            graphRunner -> carshareGraph "6. Executes carshare routing graph"
            carshareGraph -> agentHarness "7. Starts DeepAgents run for the Carshare Persistence Agent"
            agentHarness -> carsharePersistenceAgent "8. DeepAgents repeatedly inspects state, selects operations, uses tools, and continues until complete or blocked"
            carsharePersistenceAgent -> carshareApiSkill "9. Loads DeepAgents-compatible operation requirements, clarification rules, and read-back instructions"
            carsharePersistenceAgent -> telegramAdapter "10a. Asks one focused clarification when required fields are missing or ambiguous"
            carsharePersistenceAgent -> toolClientLayer "10b. Calls permitted Carshare Service tool only after required body is complete"
            toolClientLayer -> carshareService "11. Calls HTTP/JSON endpoint"
            carshareService -> postgres "12. Reads or writes owned carshare data"
            carsharePersistenceAgent -> toolClientLayer "13. DeepAgents performs configured success read-back through wrapped tools after writes"
            carsharePersistenceAgent -> telegramAdapter "14. Produces concise confirmation plus read-back or error guidance"
            telegramAdapter -> telegram "15. Sends bot response"
            telegram -> user "16. Displays response"
            autolayout lr
        }

        deployment agentRuntime "Production" "deployment-oracle-compose" "Deployment on Oracle VM using Docker Compose." {
            include *
            autolayout lr
        }

        styles {
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Database" {
                shape cylinder
                background #2f95c8
                color #ffffff
            }
            element "External System" {
                background #999999
                color #ffffff
            }
            element "Optional" {
                border dashed
            }
            element "Future Optional" {
                border dashed
                opacity 40
            }
        }
    }

    configuration {
        scope softwareSystem
    }
}
