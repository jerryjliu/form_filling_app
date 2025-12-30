# High-level workflows doc for LLMs and Humans

# LlamaIndex Workflows - A Practical Compendium

## 0. Introduction

`llama-index-workflows` are an event-driven, async-first, step-based way to provide and control the execution flow of applications aimed at intelligent automation (AI agents, for instance).

## 1. Installation

You can install workflows using `pip` with:

```bash
pip install llama-index-workflows
```

or add them to a `uv` project with:

```bash
uv add llama-index-workflows
```

Once you installed them, you can use them within your code under the `workflows` namespace:

```python
from workflows import Workflow, Context, step
```

## 2. The Core Components

### 2.1 Event

`Event`is the base class for designing the events that will drive your workflow. There are five types of events:

- `StartEvent` : it’s the input event that kicks off the workflow
- `Event` : base class from which all intermediate workflow events should inherit
- `StopEvent` : last event of the workflow, should contain the output. The workflow will stop as soon as the event is returned from a step
- `InputRequiredEvent`: this event is emitted when an external input is required
- `HumanResponseEvent`: this event is emitted when a human response is returned.

> `InputRequiredEvent` and `HumanResponseEvent` are often coupled and often used to build human-in-the-loop (HITL) workflows. See the _Design Patterns_ section to gain more insight on this.

You should design the workflow around these events, and they are highly customizable (you can subclass them to add specific data transferred with them):

```python
from workflows.events import Event, StartEvent, StopEvent


class CustomStartEvent(StartEvent):
    message: str


class GreetingEvent(Event):
    greeting: str
    is_formal: bool
    time: float


class OutputEvent(StopEvent):
    output: list[str]
```

Events behave like Pydantic `BaseModel` subclasses, so their attributes can be set, modified and fetched very easily:

```python
from workflows.events import Event


class SomeEvent(Event):
    data: str


event = SomeEvent(data="hello world")
event.data = "hello universe"
print(event.data)
```

### 2.2 Context

Context is arguably the most important piece of workflows, since it holds:

- Control over statefulness execution
- Control over stored information
- Control over events emission and collection

**2.2.a Stateful execution**

Context contains a State, which is a representation of the current state of the execution flow. By default, you can access to the state and edit its property with these operations:

```python
from workflows import Workflow, Context, step


class ExampleWorkflow(Workflow):
    @step
    async def modify_state(self, ev: StartEvent, ctx: Context) -> SecondEvent:
        async with ctx.store.edit_state() as state:
            state.age = ev.age
            state.username = ev.username
            state.email = ev.email
        ## rest of the step implementation
```

You can also specify a customized model for the state, and initialize the context with that:

```python
from workflows import Workflow, Context, step
from pydantic import BaseModel


class WorkflowState(BaseModel):
    username: str
    email: str
    age: int


class ExampleWorkflow(Workflow):
    @step
    async def modify_state(
        self, ev: StartEvent, ctx: Context[WorkflowState]
    ) -> SecondEvent:
        async with ctx.store.edit_state() as state:
            state.age = ev.age
            state.username = ev.username
            state.email = ev.email
        ## rest of the step implementation
```

It is advisable to use a customized State to avoid unexpected behaviors.

**2.2.b Store**

Store is, by default, a dict-like object contained in the Context: it is mainly used for more long-term storage, and you can get and set values in this way:

```python
from workflows import Workflow, Context, step


class ExampleWorkflow(Workflow):
    @step
    async def get_set_store(self, ev: StartEvent, ctx: Context) -> SecondEvent:
        n_iterations = ctx.store.get("n_iterations", default=None)
        if n_iterations:
            n_iterations += 1
            ctx.store.set("n_iterations", n_iterations)
        else:
            ctx.store.set("n_iterations", 1)
        ## rest of the step implementation
```

Unless motivated by specific reasons, it is advisable to use `state` over `store` .

**2.2.c Emitting and collecting events**

Context can be used also to emit and collect events, as well as writing them to the event stream.

```python
class ParallelFlow(Workflow):
    @step
    async def start(self, ctx: Context, ev: StartEvent) -> StepTwoEvent | None:
        ctx.send_event(StepTwoEvent(query="Query 1"))

    @step
    async def step_two(self, ctx: Context, ev: StepTwoEvent) -> StopEvent:
        print("Running slow query ", ev.query)
        await asyncio.sleep(random.randint(1, 5))

        return StopEvent(result=ev.query)
```

As you can see, emitting an event with `ctx.send_event` sends it directly to the step that receive that event as input.

You can also implement a fan-in/fan-out pattern sending out event, having one or more worker steps that process those events, and then collecting the events with `ctx.collect_events` in a last step and emitting an output:

```python
class ConcurrentFlow(Workflow):
    @step
    async def start(
        self, ctx: Context, ev: StartEvent
    ) -> StepAEvent | StepBEvent | StepCEvent | None:
        ctx.send_event(StepAEvent(query="Query 1"))
        ctx.send_event(StepBEvent(query="Query 2"))
        ctx.send_event(StepCEvent(query="Query 3"))

    @step
    async def step_a(self, ctx: Context, ev: StepAEvent) -> StepACompleteEvent:
        print("Doing something A-ish")
        return StepACompleteEvent(result=ev.query)

    @step
    async def step_b(self, ctx: Context, ev: StepBEvent) -> StepBCompleteEvent:
        print("Doing something B-ish")
        return StepBCompleteEvent(result=ev.query)

    @step
    async def step_c(self, ctx: Context, ev: StepCEvent) -> StepCCompleteEvent:
        print("Doing something C-ish")
        return StepCCompleteEvent(result=ev.query)

    @step
    async def step_three(
        self,
        ctx: Context,
        ev: StepACompleteEvent | StepBCompleteEvent | StepCCompleteEvent,
    ) -> StopEvent:
        print("Received event ", ev.result)

        # wait until we receive 3 events
        if (
            ctx.collect_events(
                ev,
                [StepCCompleteEvent, StepACompleteEvent, StepBCompleteEvent],
            )
            is None
        ):
            return None

        # do something with all 3 results together
        return StopEvent(result="Done")
```

**2.2.d Serializing Context**

The context can be serialized into a dict. This is useful for saving state between `.run()` calls and letting steps access state store variables from previous runs, or even checkpointing state as a workflow is running.

The context is bound to a specific workflow, and tracks all the inner state and machinery needed for the runtime of the workflow.

```python
from workflows import Context

w = MyWorkflow()
ctx = Context(w)

result = await w.run(..., ctx=ctx)
# run again with access to previous state
result = await w.run(..., ctx=ctx)

# Serialize
ctx_dict = ctx.to_dict()

# Re-create
restored_ctx = Context.from_dict(w, ctx_dict)
result = await w.run(..., ctx=ctx)
```

Context serialization relies on your workflow events and workflow state store containing serializable data. If you store arbitrary objects, or don’t leverage pydantic functionalities to control serialization of state/events, you may encounter errors.

### 2.3 Resources

Resources are external dependencies injected into workflow steps. Use `Annotated[Type, Resource(factory_function)]` in step parameters to inject them.

**Example:**

```python
from workflows.resource import Resource
from llama_index.core.memory import Memory


def get_memory(*args, **kwargs):
    return Memory.from_defaults("user_id_123", token_limit=60000)


class WorkflowWithResource(Workflow):
    @step
    async def first_step(
        self,
        ev: StartEvent,
        memory: Annotated[Memory, Resource(get_memory)],
    ) -> SecondEvent:
        await memory.aput(ChatMessage(role="user", content="First step"))
        return SecondEvent(msg="Input for step 2")

    @step
    async def second_step(
        self, ev: SecondEvent, memory: Annotated[Memory, Resource(get_memory)]
    ) -> StopEvent:
        await memory.aput(ChatMessage(role="user", content=ev.msg))
        return StopEvent(result="Messages stored")
```

**Key Points:**

- Factory function return type must match declared type
- Resources are shared across steps by default (cached)
- Use `Resource(factory_func, cache=False)` to avoid steps sharing the same resource

### 2.4 The Workflow

There have been already several examples that implemented the `Workflow` class, but let’s understand it better:

- When you want to create a workflow, that has to be a subclass of the `Workflow` class
- Each of the functions of the workflow representing a step must be decorated with the `@step` decorator
- Each of the functions of the workflow must take at least an event type as an input and emit at least an event type as an output, although it is also allowed to output None. If these rules are not respected, you will encounter a validation error.
- Workflows can have linear, parallel/concurrent or cyclic execution patterns
- Every workflow instance has a timeout (by default 45 seconds): remember to set it at a higher value when needed by passing `timeout=Nseconds` when initializing your workflow (as in `wf = MyWorkflow(timeout=300)`)

Let’s see a complete example of a workflow:

```python
from workflows import Workflow, step
from workflows.events import Event, StartEvent, StopEvent

# `pip install llama-index-llms-openai` if you don't already have it
from llama_index.llms.openai import OpenAI


class JokeEvent(Event):
    joke: str


class JokeFlow(Workflow):
    llm = OpenAI()

    @step
    async def generate_joke(self, ev: StartEvent) -> JokeEvent:
        topic = ev.topic

        prompt = f"Write your best joke about {topic}."
        response = await self.llm.acomplete(prompt)
        return JokeEvent(joke=str(response))

    @step
    async def critique_joke(self, ev: JokeEvent) -> StopEvent:
        joke = ev.joke

        prompt = f"Give a thorough analysis and critique of the following joke: {joke}"
        response = await self.llm.acomplete(prompt)
        return StopEvent(result=str(response))


w = JokeFlow(timeout=60, verbose=False)
result = await w.run(topic="pirates")
print(str(result))
```

As you can see, running a workflow is an asynchronous operation. You can also create an asynchronous iterator over the events produced by the workflow (you need to explicitly emit them with `ctx.write_event_to_stream` within the workflow) and read these events _while_ they are produced:

```python
from workflows import Workflow, step, Context
from workflows.events import Event, StartEvent, StopEvent

# `pip install llama-index-llms-openai` if you don't already have it
from llama_index.llms.openai import OpenAI


class JokeEvent(Event):
    joke: str


class JokeFlow(Workflow):
    llm = OpenAI()

    @step
    async def generate_joke(self, ev: StartEvent, ctx: Context) -> JokeEvent:
        topic = ev.topic

        prompt = f"Write your best joke about {topic}."
        response = await self.llm.acomplete(prompt)
        ctx.write_event_to_stream(JokeEvent(joke=str(response)))
        return JokeEvent(joke=str(response))

    @step
    async def critique_joke(self, ev: JokeEvent, ctx: Context) -> StopEvent:
        joke = ev.joke

        prompt = f"Give a thorough analysis and critique of the following joke: {joke}"
        response = await self.llm.acomplete(prompt)
        ctx.write_event_to_stream(StopEvent(result=str(response)))
        return StopEvent(result=str(response))


async def main():
    w = JokeFlow(timeout=60, verbose=False)
    handler = w.run(topic="pirates")
    async for event in handler.stream_events():
        if isinstance(event, JokeEvent):
            print("Produced joke:", event.joke)

    result = await handler
    print(str(result))


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
```

## 3. Design Patterns

### 3.1 Human-In-The-Loop

Workflows support human-in-the-loop patterns using `InputRequiredEvent` and `HumanResponseEvent` during event streaming.

**Basic Implementation:**

```python
from workflows.events import InputRequiredEvent, HumanResponseEvent


class HumanInTheLoopWorkflow(Workflow):
    @step
    async def step1(self, ev: StartEvent) -> InputRequiredEvent:
        return InputRequiredEvent(prefix="Enter a number: ")

    @step
    async def step2(self, ev: HumanResponseEvent) -> StopEvent:
        return StopEvent(result=ev.response)


workflow = HumanInTheLoopWorkflow()
handler = workflow.run()

async for event in handler.stream_events():
    if isinstance(event, InputRequiredEvent):
        response = input(event.prefix)
        handler.ctx.send_event(HumanResponseEvent(response=response))

final_result = await handler
```

**Pausable Implementation:**
You can break out of the loop and resume later:

```python
handler = workflow.run()

# Pause at human input
async for event in handler.stream_events():
    if isinstance(event, InputRequiredEvent):
        break

# Handle response
response = input(event.prefix)
handler.ctx.send_event(HumanResponseEvent(response=response))

# Resume workflow
async for event in handler.stream_events():
    continue

final_result = await handler
```

The workflow waits for `HumanResponseEvent` emission and supports flexible input handling (input(), websockets, async state, etc.).

### 3.2 Branching and Looping

Workflows enable branching and looping logic more simply and flexibly than graph-based approaches.

**3.2.a Loops**

Create loops by adding custom event types and conditional returns:

```python
class LoopEvent(Event):
    loop_output: str


@step
async def step_one(self, ev: StartEvent | LoopEvent) -> FirstEvent | LoopEvent:
    if random.randint(0, 1) == 0:
        print("Bad thing happened")
        return LoopEvent(loop_output="Back to step one.")
    else:
        print("Good thing happened")
        return FirstEvent(first_output="First step complete.")
```

You can create loops from any step to any other step by defining appropriate event and return types.

**3.2.b Branches**

Branch workflows by conditionally returning different events:

```python
class BranchA1Event(Event):
    payload: str


class BranchA2Event(Event):
    payload: str


class BranchB1Event(Event):
    payload: str


class BranchB2Event(Event):
    payload: str


class BranchWorkflow(Workflow):
    @step
    async def start(self, ev: StartEvent) -> BranchA1Event | BranchB1Event:
        if random.randint(0, 1) == 0:
            return BranchA1Event(payload="Branch A")
        else:
            return BranchB1Event(payload="Branch B")

    @step
    async def step_a1(self, ev: BranchA1Event) -> BranchA2Event:
        return BranchA2Event(payload=ev.payload)

    @step
    async def step_b1(self, ev: BranchB1Event) -> BranchB2Event:
        return BranchB2Event(payload=ev.payload)

    @step
    async def step_a2(self, ev: BranchA2Event) -> StopEvent:
        return StopEvent(result="Branch A complete.")

    @step
    async def step_b2(self, ev: BranchB2Event) -> StopEvent:
        return StopEvent(result="Branch B complete.")
```

You can combine branches and loops in any order. Later sections cover running multiple branches in parallel using `send_event` and synchronizing them with `collect_events`.

### 3.3 Fan in/Fan out

Using async concurrency, users can dispatch multiple events at once, run work concurrently, and collecting the results. With workflows, this happens using the `send_event` and `collect_events` methods.

```python
class ProcessEvent(Event):
    pass


class ResultEvent(Event):
    pass


class FanInFanOut(Workflow):
    @step
    def init_run(self, ctx: Context, ev: StartEvent) -> ProcessEvent:
        await ctx.store.set("num_to_collect", len(ev.items))
        for item in ev.items:
            ctx.send_event(ProcessEvent())

    @step
    def process(self, ev: ProcessEvent) -> ResultEvent:
        await some_work()
        return ResultEvent()

    @step
    def finalize(self, ctx: Context, ev: ResultEvent) -> StopEvent | None:
        num_to_collect = await ctx.store.get("num_to_collect")
        events = ctx.collect_events(ev, [ResultEvent] * num_to_collect)
        if events is None:
            # Not enough collected yet
            return None

        await finalize_results(events)
        return StopEvent(result="Done!")
```

The `init_run` step emits several `ProcessEvent`s. The step signature is still annotated that it returns `ProcessEvent` even though it doesn't technically, in order to help validate the workflow.

`finalize()` will be triggered each time a `ResultEvent` comes in, and will only complete once all events are present.

## 4. Building Workflows with LlamaCloud Services

The following code provides you a template for building workflows with LlamaCloud Services.

This template provides the basic setup for a document processing workflow using
LlamaParse, LlamaExtract, and LLMs. The actual workflow logic should be implemented
based on your specific requirements.

```python
from pydantic import BaseModel, Field

# =============================================================================
# SETUP
# =============================================================================

# Environment Variables - assume these are already set
# os.environ["LLAMA_CLOUD_API_KEY"] = "llx-..."  # Set in environment
# os.environ["OPENAI_API_KEY"] = "sk-proj-..."   # Set in environment

# Project Configuration - these will be passed as parameters
project_id = "your-project-id"  # Replace with your project ID
organization_id = "your-organization-id"  # Replace with your organization ID

# =============================================================================
# INITIALIZE LLMS AND EMBEDDINGS
# =============================================================================

from llama_index.core import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

# Set LLM, embedding model
embed_model = OpenAIEmbedding(model_name="text-embedding-3-small")
llm = OpenAI(model="gpt-4.1")
Settings.llm = llm
Settings.embed_model = embed_model

# =============================================================================
# INITIALIZE LLAMAPARSE
# =============================================================================

from llama_cloud_services import LlamaParse

# # Cost-Effective Mode
# llama_parser = LlamaParse(
#   # See how to get your API key at https://docs.cloud.llamaindex.ai/api_key
#   parse_mode="parse_page_with_llm",
#   high_res_ocr=True,
#   adaptive_long_table=True,
#   outlined_table_extraction=True,
#   output_tables_as_HTML=True,
#   result_type="markdown",
#   project_id=project_id,
#   organization_id=organization_id,
# )

# Agentic Mode (Default)
llama_parser = LlamaParse(
    # See how to get your API key at https://docs.cloud.llamaindex.ai/api_key
    parse_mode="parse_page_with_agent",
    model="openai-gpt-4-1-mini",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)

# # Agentic Plus Mode
# llama_parser = LlamaParse(
#   # See how to get your API key at https://docs.cloud.llamaindex.ai/api_key
#   parse_mode="parse_page_with_agent",
#   model="anthropic-sonnet-4.0",
#   high_res_ocr=True,
#   adaptive_long_table=True,
#   outlined_table_extraction=True,
#   output_tables_as_HTML=True,
#   result_type="markdown",
#   project_id=project_id,
#   organization_id=organization_id,
# )


# =============================================================================
# INITIALIZE LLAMAEXTRACT
# =============================================================================

from llama_cloud import ExtractConfig, ExtractMode
from llama_cloud.core.api_error import ApiError
from llama_cloud_services import LlamaExtract

# Initialize LlamaExtract
llama_extract = LlamaExtract(
    show_progress=True,
    check_interval=5,
    project_id=project_id,
    organization_id=organization_id,
)

# =============================================================================
# DEFINE YOUR DATA SCHEMA
# =============================================================================


class YourDataSchema(BaseModel):
    """Define your extraction schema here based on the task and reference files"""

    field1: str = Field(..., description="Description of field1")
    field2: float | None = Field(None, description="Description of field2")
    # Add more fields as needed based on your specific task


# Create extraction agent
extract_config = ExtractConfig(
    # Basic options
    extraction_mode=ExtractMode.MULTIMODAL,  # FAST, BALANCED, MULTIMODAL, PREMIUM
    # extraction_target=ExtractTarget.PER_DOC,   # PER_DOC, PER_PAGE
    # system_prompt="<Insert relevant context for extraction>", # set system prompt - can leave blank
    # Advanced options
    # chunk_mode=ChunkMode.PAGE,     # PAGE, SECTION
    # high_resolution_mode=True,     # Enable for better OCR
    # invalidate_cache=False,        # Set to True to bypass cache
    # Extensions (see Extensions page for details)
    # cite_sources=True,             # Enable citations
    # use_reasoning=True,            # Enable reasoning (not available in FAST mode)
    # confidence_scores=True         # Enable confidence scores (MULTIMODAL/PREMIUM only)
)

# Handle existing agent - delete if it exists
try:
    existing_agent = llama_extract.get_agent(name="YourExtractorName")
    if existing_agent:
        print("Deleting existing agent: YourExtractorName")
        # Deletion can take some time since all underlying files will be purged
        llama_extract.delete_agent(existing_agent.id)
except ApiError as e:
    if e.status_code == 404:
        pass  # Agent doesn't exist, which is fine
    else:
        raise  # Re-raise other errors

extract_agent = llama_extract.create_agent(
    "YourExtractorName", data_schema=YourDataSchema, config=extract_config
)

# =============================================================================
# WORKFLOW EVENTS
# =============================================================================

from llama_index.core.schema import TextNode
from workflows import Context, Workflow, step
from workflows.events import Event, StartEvent, StopEvent

# Import splitting functions (only needed if splitting is implemented)
# from test_utils import afind_categories_and_splits


class ParseDocEvent(Event):
    nodes: list[TextNode]


class SplitDocEvent(Event):
    splits: dict[str, list[str]]  # split_name -> list of node content


class ExtractDataEvent(Event):
    data_list: list[
        YourDataSchema
    ]  # Always a list - single item for no splitting, multiple items for splitting


# ADDITIONAL EVENTS YOU CAN DEFINE AS NEEDED, EXAMPLES BELOW (NOT EXCLUSIVE):
# class PreprocessEvent(Event):
#     """For preprocessing steps like cleaning, filtering, etc."""
#     processed_nodes: List[str]
#
# class ValidateEvent(Event):
#     """For validation steps"""
#     validated_data: YourDataSchema
#
# class TransformEvent(Event):
#     """For data transformation steps"""
#     transformed_data: Dict
#
# class AggregateEvent(Event):
#     """For aggregating results from multiple files"""
#     aggregated_results: List[YourDataSchema]

# =============================================================================
# WORKFLOW IMPLEMENTATION
# =============================================================================


class YourWorkflow(Workflow):
    def __init__(
        self,
        llama_parser: LlamaParse,
        extract_agent: LlamaExtract,
        output_file: str = "results.csv",
        verbose: bool = False,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.llama_parser = llama_parser
        self.extract_agent = extract_agent
        self.output_file = output_file
        self.verbose = verbose

    @step
    async def parse_document(
        self, ctx: Context, ev: StartEvent
    ) -> ParseDocEvent:
        """
        Parse the input document using LlamaParse
        """
        # TODO: Implement document parsing
        # result = await self.llama_parser.aparse(ev.file_path)
        # markdown_nodes = await result.aget_markdown_nodes(split_by_page=True)
        # return ParseDocEvent(nodes=markdown_nodes)
        pass

    # OPTIONAL STEPS - UNCOMMENT AND IMPLEMENT AS NEEDED, EXAMPLES BELOW (NOT EXCLUSIVE)

    # @step
    # async def preprocess_document(self, ctx: Context, ev: ParseDocEvent) -> PreprocessEvent:
    #     """
    #     Preprocess the parsed document (cleaning, filtering, etc.)
    #     Use this if you need to clean or filter the parsed content
    #     """
    #     # TODO: Implement preprocessing if needed
    #     # Example: Remove headers, clean formatting, filter irrelevant sections
    #     # processed_nodes = self.clean_nodes(ev.nodes)
    #     # return PreprocessEvent(processed_nodes=processed_nodes)
    #     pass

    # @step
    # async def split_document(self, ctx: Context, ev: ParseDocEvent) -> SplitDocEvent:
    #     """
    #     Split the document into sections (only implement if task requires splitting)
    #     Use afind_categories_and_splits pattern from asset_manager_fund_analysis.md
    #     """
    #     # TODO: Implement document splitting if needed
    #     # This step is optional - only implement if the task explicitly requires splitting
    #     # Example: "split by sections", "process each chapter separately"
    #     #
    #     # from test_utils import afind_categories_and_splits
    #     #
    #     # split_description = "Find and split by each major section in this document"
    #     # split_rules = "Split by document sections, chapters, or major headings"
    #     # split_key = "section"
    #     #
    #     # splits = await afind_categories_and_splits(
    #     #     split_description,
    #     #     split_key,
    #     #     ev.nodes,
    #     #     additional_split_rules=split_rules,
    #     #     llm=llm,
    #     #     verbose=self.verbose,
    #     # )
    #     # return SplitDocEvent(splits=splits)
    #     pass

    @step
    async def extract_data(
        self, ctx: Context, ev: ParseDocEvent
    ) -> ExtractDataEvent:
        """
        Extract data from the parsed document
        """
        # TODO: Implement data extraction

        # PATTERN 1: No splitting - extract from entire document
        # combined_text = "\n".join([node.get_content(metadata_mode="all") for node in ev.nodes])
        # result_dict = (await self.extract_agent.aextract(SourceText(text_content=combined_text))).data
        # extracted_data = YourDataSchema.model_validate(result_dict)
        # return ExtractDataEvent(data_list=[extracted_data])  # Single item in list

        # PATTERN 2: With splitting - extract from each split (uncomment if splitting is implemented)
        # from llama_index.core.async_utils import run_jobs
        #
        # async def extract_from_split(split_name: str, split_nodes: List[TextNode]) -> YourDataSchema:
        #     """Extract data from a single split"""
        #     combined_text = "\n".join([node.get_content(metadata_mode="all") for node in split_nodes])
        #     result_dict = (await self.extract_agent.aextract(SourceText(text_content=combined_text))).data
        #     return YourDataSchema.model_validate(result_dict)
        #
        # # Get splits from previous step (if splitting was implemented)
        # # splits = ev.splits  # This would come from SplitDocEvent
        # # tasks = [extract_from_split(split_name, split_nodes) for split_name, split_nodes in splits.items()]
        # # extracted_data_list = await run_jobs(tasks, workers=8, show_progress=True)
        # # return ExtractDataEvent(data_list=extracted_data_list)  # Multiple items in list

        pass

    # @step
    # async def validate_data(self, ctx: Context, ev: ExtractDataEvent) -> ValidateEvent:
    #     """
    #     Validate the extracted data (optional validation step)
    #     Use this if you need to validate data quality, completeness, etc.
    #     """
    #     # TODO: Implement data validation if needed
    #     # Example: Check for required fields, validate data types, etc.
    #     # validated_data = self.validate_extracted_data(ev.data)
    #     # return ValidateEvent(validated_data=validated_data)
    #     pass

    # @step
    # async def transform_data(self, ctx: Context, ev: ExtractDataEvent) -> TransformEvent:
    #     """
    #     Transform the extracted data (optional transformation step)
    #     Use this if you need to calculate derived fields, format data, etc.
    #     """
    #     # TODO: Implement data transformation if needed
    #     # Example: Calculate growth rates, format currency, aggregate metrics
    #     # transformed_data = self.transform_extracted_data(ev.data)
    #     # return TransformEvent(transformed_data=transformed_data)
    #     pass

    @step
    async def analyze_results(
        self, ctx: Context, ev: ExtractDataEvent
    ) -> StopEvent:
        """
        Analyze and format the extracted results
        """
        # TODO: Implement result analysis and output
        # This could include creating DataFrames, saving to files, etc.

        # Always work with a list - single item for no splitting, multiple items for splitting
        # import pandas as pd
        # df = pd.DataFrame([data.dict() for data in ev.data_list])
        #
        # # Save results to file
        # df.to_csv(self.output_file, index=False)
        #
        # # Print summary if verbose
        # if self.verbose:
        #     print(f"Extracted {len(ev.data_list)} records")
        #     print(f"Results saved to: {self.output_file}")
        #     print("\nSummary:")
        #     print(df.head())
        #
        # return StopEvent(result={"dataframe": df, "raw_data": ev.data_list, "output_file": self.output_file})

        pass


# =============================================================================
# MAIN FUNCTION (EXAMPLE)
# =============================================================================


async def main():
    """
    Main function to run the workflow with configurable input files
    """
    # Set up argument parsing
    parser = argparse.ArgumentParser(
        description="Document Processing Workflow"
    )
    parser.add_argument(
        "input_files", nargs="+", help="Input files to process"
    )
    parser.add_argument(
        "--output", "-o", default="results.csv", help="Output file path"
    )
    parser.add_argument(
        "--project-id", "-p", default=project_id, help="LlamaCloud project ID"
    )
    parser.add_argument(
        "--organization-id",
        "-org",
        default=organization_id,
        help="LlamaCloud organization ID",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose output"
    )

    args = parser.parse_args()

    # Note: project_id and organization_id are typically set at module level
    # and don't need to be updated here unless you want to override them

    print(f"Processing {len(args.input_files)} file(s)...")

    # Process each input file
    all_results = []
    for file_path in args.input_files:
        print(f"Processing: {file_path}")
        try:
            # Initialize and run workflow
            workflow = YourWorkflow(
                llama_parser=llama_parser,
                extract_agent=extract_agent,
                output_file=args.output,
                verbose=args.verbose,
                timeout=None,
            )

            result = await workflow.run(file_path=file_path)
            all_results.append(result)
            print(f"Successfully processed: {file_path}")
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            continue

    # Final analysis and output
    if all_results:
        # Results are already saved by the workflow
        if args.verbose:
            print(f"\nAll files processed successfully!")
            print(f"Results saved to: {args.output}")
        return all_results
    else:
        print("No files were successfully processed")
        return None


if __name__ == "__main__":
    # Run the workflow
    asyncio.run(main())
```


---

# High-level LlamaCloud Doc for LLMs and Humans

# Building with LlamaCloud in Python

## A compendium of examples and explanations

### Introduction

[LlamaCloud](https://cloud.llamaindex.ai/) is a cloud platform provided by LlamaIndex for intelligent document processing.

It is composed of three main services:

- [LlamaParse](https://www.llamaindex.ai/llamaparse), for parsing and extracting text, charts, tables and images from unstructured files
- [LlamaExtract](https://www.llamaindex.ai/llamaextract), for extracting structured data from files following specific patterns
- LlamaCloud Index, for storing, indexing and retrieving documents, especially oriented towards retrieval-augmented generation.

You can interact with LlamaCloud services through a python SDK, that you can easily obtain by installing it from PyPI:

```bash
# if you are using pip
pip install llama-cloud-services
# if you are in a uv project
uv add llama-cloud-services

```

It is important to remember that, before using any of these services, you need to have the `LLAMA_CLOUD_API_KEY` set in your environment:

```bash
export LLAMA_CLOUD_API_KEY="***"
```

There is thus no need to pass the API key directly as an argument to any of the services listed below.

Let's see some examples of how to interact with the various services.

### Parse

You can get started by creating simple scripts:

```python
from llama_cloud_services import LlamaParse

parser = LlamaParse(
    parse_mode="parse_page_with_agent",
    model="openai-gpt-4-1-mini",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)

# sync
result = parser.parse("./my_file.pdf")

# sync batch
results = parser.parse(["./my_file1.pdf", "./my_file2.pdf"])

# async
result = await parser.aparse("./my_file.pdf")

# async batch
results = await parser.aparse(["./my_file1.pdf", "./my_file2.pdf"])
```

The result object is a fully typed `JobResult` object, and you can interact with it to parse and transform various parts of the result:

```python
# get the llama-index markdown documents
markdown_documents = result.get_markdown_documents(split_by_page=True)

# get the llama-index text documents
text_documents = result.get_text_documents(split_by_page=False)

# get the image documents
image_documents = result.get_image_documents(
    include_screenshot_images=True,
    include_object_images=False,
    # Optional: download the images to a directory
    # (default is to return the image bytes in ImageDocument objects)
    image_download_dir="./images",
)

# access the raw job result
# Items will vary based on the parser configuration
for page in result.pages:
    print(page.text)
    print(page.md)
    print(page.images)
    print(page.layout)
    print(page.structuredData)

# you can also extract tables from the parse results
result = parser.get_json_result("./my_file.pdf")
tables = parser.get_tables(result)
```

See more details about the result object in the [example notebook](https://www.notion.so/llamaindex/docs/examples-py/parse/demo_json_tour.ipynb).

### Using different parse pre-sets

In the following examples, you will find some sets of arguments that you can pass to LlamaParse. Please, make sure to use only these pre-defined sets of arguments when initializing LlamaParse.

```python
from llama_cloud_services import LlamaParse

# Cost-Effective Mode
llama_parser = LlamaParse(
    # See how to get your API key at https://docs.cloud.llamaindex.ai/api_key
    parse_mode="parse_page_with_llm",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)

# Agentic Mode (Default)
llama_parser = LlamaParse(
    # See how to get your API key at https://docs.cloud.llamaindex.ai/api_key
    parse_mode="parse_page_with_agent",
    model="openai-gpt-4-1-mini",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)

# Agentic Plus Mode
llama_parser = LlamaParse(
    # See how to get your API key at https://docs.cloud.llamaindex.ai/api_key
    parse_mode="parse_page_with_agent",
    model="anthropic-sonnet-4.0",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)
```

### Using with file object / bytes

You can parse a file object directly:

```python
from llama_cloud_services import LlamaParse

parser = LlamaParse(
    parse_mode="parse_page_with_agent",
    model="openai-gpt-4-1-mini",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)

file_name = "my_file1.pdf"
extra_info = {"file_name": file_name}

with open(f"./{file_name}", "rb") as f:
    # must provide extra_info with file_name key with passing file object
    result = parser.parse(f, extra_info=extra_info)

# you can also pass file bytes directly
with open(f"./{file_name}", "rb") as f:
    file_bytes = f.read()
    # must provide extra_info with file_name key with passing file bytes
    result = parser.parse(file_bytes, extra_info=extra_info)
```

### Using with `SimpleDirectoryReader`

You can also integrate the parser as the default PDF loader in `SimpleDirectoryReader`:

```python
from llama_cloud_services import LlamaParse
from llama_index.core import SimpleDirectoryReader

parser = LlamaParse(
    parse_mode="parse_page_with_agent",
    model="openai-gpt-4-1-mini",
    high_res_ocr=True,
    adaptive_long_table=True,
    outlined_table_extraction=True,
    output_tables_as_HTML=True,
    result_type="markdown",
    project_id=project_id,
    organization_id=organization_id,
)

file_extractor = {".pdf": parser}
documents = SimpleDirectoryReader(
    "./data", file_extractor=file_extractor
).load_data()
```

### Extract

### Quick Start

The simplest way to get started is to use the stateless API with the extraction configuration and the file/text to extract from:

```python
from llama_cloud_services import LlamaExtract
from llama_cloud import ExtractConfig, ExtractMode
from pydantic import BaseModel, Field

# Initialize client
extractor = LlamaExtract(
    show_progress=True,
    check_interval=5,
    project_id=project_id,
    organization_id=organization_id,
)


# Define schema using Pydantic
class Resume(BaseModel):
    name: str = Field(description="Full name of candidate")
    email: str = Field(description="Email address")
    skills: list[str] = Field(description="Technical skills and technologies")


# Configure extraction settings
extract_config = ExtractConfig(
    # Basic options
    extraction_mode=ExtractMode.MULTIMODAL,  # FAST, BALANCED, MULTIMODAL, PREMIUM
    extraction_target=ExtractTarget.PER_DOC,  # PER_DOC, PER_PAGE
    system_prompt="<Insert relevant context for extraction>",  # set system prompt - can leave blank
    # Advanced options
    chunk_mode=ChunkMode.PAGE,  # PAGE, SECTION
    high_resolution_mode=True,  # Enable for better OCR
    nvalidate_cache=False,  # Set to True to bypass cache
    # Extensions
    cite_sources=True,  # Enable citations
    use_reasoning=True,  # Enable reasoning (not available in FAST mode)
    confidence_scores=True,  # Enable confidence scores (MULTIMODAL/PREMIUM only)
)

# Extract data directly from document - no agent needed!
result = extractor.extract(Resume, config, "resume.pdf")
print(result.data)
```

### Supported File Types

LlamaExtract supports the following file formats:

- **Documents**: PDF (.pdf), Word (.docx)
- **Text files**: Plain text (.txt), CSV (.csv), JSON (.json), HTML (.html, .htm), Markdown (.md)
- **Images**: PNG (.png), JPEG (.jpg, .jpeg)

### Different Input Types

```python
# From file path (string or Path)
result = extractor.extract(Resume, config, "resume.pdf")

# From file handle
with open("resume.pdf", "rb") as f:
    result = extractor.extract(Resume, config, f)

# From bytes with filename
with open("resume.pdf", "rb") as f:
    file_bytes = f.read()
from llama_cloud_services.extract import SourceText

result = extractor.extract(
    Resume, config, SourceText(file=file_bytes, filename="resume.pdf")
)

# From text content
text = "Name: John Doe\\nEmail: john@example.com\\nSkills: Python, AI"
result = extractor.extract(Resume, config, SourceText(text_content=text))
```

### Async Extraction

For better performance with multiple files or when integrating with async applications.
Here `queue_extraction` will enqueue the extraction jobs and exit. Alternatively, you
can use `aextract` to poll for the job and return the extraction results.

```python
import asyncio


async def extract_resumes():
    # Async extraction
    result = await extractor.aextract(Resume, config, "resume.pdf")
    print(result.data)

    # Queue extraction jobs (returns immediately)
    jobs = await extractor.queue_extraction(
        Resume, config, ["resume1.pdf", "resume2.pdf"]
    )
    print(f"Queued {len(jobs)} extraction jobs")
    return jobs


# Run async function
jobs = asyncio.run(extract_resumes())
# Check job status
for job in jobs:
    status = agent.get_extraction_job(job.id).status
    print(f"Job {job.id}: {status}")

# Get results when complete
results = [agent.get_extraction_run_for_job(job.id) for job in jobs]
```

### Core Concepts

- **Data Schema**: Structure definition for the data you want to extract in the form of a JSON schema or a Pydantic model.
- **Extraction Config**: Settings that control how extraction is performed (e.g., speed vs accuracy trade-offs).
- **Extraction Jobs**: Asynchronous extraction tasks that can be monitored.
- **Extraction Agents** (Advanced): Reusable extractors configured with a specific schema and extraction settings.

### Defining Schemas

Schemas define the structure of data you want to extract. You can use either Pydantic models or JSON Schema:

### Using Pydantic (Recommended)

```python
from pydantic import BaseModel, Field
from typing import List, Optional
from llama_cloud import ExtractConfig, ExtractMode


class Experience(BaseModel):
    company: str = Field(description="Company name")
    title: str = Field(description="Job title")
    start_date: Optional[str] = Field(description="Start date of employment")
    end_date: Optional[str] = Field(description="End date of employment")


class Resume(BaseModel):
    name: str = Field(description="Candidate name")
    experience: List[Experience] = Field(description="Work history")


# Use the schema for extraction
config = ExtractConfig(extraction_mode=ExtractMode.FAST)
result = extractor.extract(Resume, config, "resume.pdf")
```

### Using JSON Schema

```python
schema = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Candidate name"},
        "experience": {
            "type": "array",
            "description": "Work history",
            "items": {
                "type": "object",
                "properties": {
                    "company": {
                        "type": "string",
                        "description": "Company name",
                    },
                    "title": {"type": "string", "description": "Job title"},
                    "start_date": {
                        "anyOf": [{"type": "string"}, {"type": "null"}],
                        "description": "Start date of employment",
                    },
                    "end_date": {
                        "anyOf": [{"type": "string"}, {"type": "null"}],
                        "description": "End date of employment",
                    },
                },
            },
        },
    },
}

# Use the schema for extraction
config = ExtractConfig(extraction_mode=ExtractMode.FAST)
result = extractor.extract(schema, config, "resume.pdf")
```

### Important restrictions on JSON/Pydantic Schema

_LlamaExtract only supports a subset of the JSON Schema specification._ While limited, it should
be sufficient for a wide variety of use-cases.

- All fields are required by default. Nullable fields must be explicitly marked as such,
  using `anyOf` with a `null` type. See `"start_date"` field above.
- Root node must be of type `object`.
- Schema nesting must be limited to within 5 levels.
- The important fields are key names/titles, type and description. Fields for
  formatting, default values, etc. are **not supported**. If you need these, you can add the
  restrictions to your field description and/or use a post-processing step. e.g. default values can be supported by making a field optional and then setting `"null"` values from the extraction result to the default value.
- There are other restrictions on number of keys, size of the schema, etc. that you may
  hit for complex extraction use cases. In such cases, it is worth thinking how to restructure
  your extraction workflow to fit within these constraints, e.g. by extracting subset of fields
  and later merging them together.

### Extraction Configuration

Configure how extraction is performed using `ExtractConfig`. The schema is the most important part, but several configuration options can significantly impact the extraction process.

```python
from llama_cloud import ExtractConfig, ExtractMode, ChunkMode, ExtractTarget

# Basic configuration
config = ExtractConfig(
    extraction_mode=ExtractMode.BALANCED,  # FAST, BALANCED, MULTIMODAL, PREMIUM
    extraction_target=ExtractTarget.PER_DOC,  # PER_DOC, PER_PAGE
    system_prompt="Focus on the most recent data",
    page_range="1-5,10-15",  # Extract from specific pages
)

# Advanced configuration
advanced_config = ExtractConfig(
    extraction_mode=ExtractMode.MULTIMODAL,
    chunk_mode=ChunkMode.PAGE,  # PAGE, SECTION
    high_resolution_mode=True,  # Better OCR accuracy
    invalidate_cache=False,  # Bypass cached results
    cite_sources=True,  # Enable source citations
    use_reasoning=True,  # Enable reasoning (not in FAST mode)
    confidence_scores=True,  # MULTIMODAL/PREMIUM only
)
```

### Key Configuration Options

**Extraction Mode**: Controls processing quality and speed

- `FAST`: Fastest processing, suitable for simple documents with no OCR
- `BALANCED`: Good speed/accuracy tradeoff for text-rich documents
- `MULTIMODAL`: For visually rich documents with text, tables, and images (recommended)
- `PREMIUM`: Highest accuracy with OCR, complex table/header detection

**Extraction Target**: Defines extraction scope

- `PER_DOC`: Apply schema to entire document (default)
- `PER_PAGE`: Apply schema to each page, returns array of results

**Advanced Options**:

- `system_prompt`: Additional system-level instructions
- `page_range`: Specific pages to extract (e.g., "1,3,5-7,9")
- `chunk_mode`: Document splitting strategy (`PAGE` or `SECTION`)
- `high_resolution_mode`: Better OCR for small text (slower processing)

**Extensions** (return additional metadata):

- `cite_sources`: Source tracing for extracted fields
- `use_reasoning`: Explanations for extraction decisions
- `confidence_scores`: Quantitative confidence measures (MULTIMODAL/PREMIUM only)

For complete configuration options, advanced settings, and detailed examples, see the [LlamaExtract Configuration Documentation](https://docs.cloud.llamaindex.ai/llamaextract/features/options).

### Extraction Agents (Advanced)

For reusable extraction workflows, you can create extraction agents that encapsulate both schema and configuration:

### Creating Agents

```python
from llama_cloud_services import LlamaExtract
from llama_cloud import ExtractConfig, ExtractMode
from pydantic import BaseModel, Field

# Initialize client
extractor = LlamaExtract()


# Define schema
class Resume(BaseModel):
    name: str = Field(description="Full name of candidate")
    email: str = Field(description="Email address")
    skills: list[str] = Field(description="Technical skills and technologies")


# Configure extraction settings
config = ExtractConfig(extraction_mode=ExtractMode.FAST)

# Create extraction agent
agent = extractor.create_agent(
    name="resume-parser", data_schema=Resume, config=config
)

# Use the agent
result = agent.extract("resume.pdf")
print(result.data)
```

### Agent Batch Processing

Process multiple files with an agent:

```python
# Queue multiple files for extraction
jobs = await agent.queue_extraction(["resume1.pdf", "resume2.pdf"])

# Check job status
for job in jobs:
    status = agent.get_extraction_job(job.id).status
    print(f"Job {job.id}: {status}")

# Get results when complete
results = [agent.get_extraction_run_for_job(job.id) for job in jobs]
```

### Updating Agent Schemas

Schemas can be modified and updated after creation:

```python
# Update schema
agent.data_schema = new_schema

# Save changes
agent.save()
```

### Managing Agents

```python
# List all agents
agents = extractor.list_agents()

# Get specific agent
agent = extractor.get_agent(name="resume-parser")

# Delete agent
extractor.delete_agent(agent.id)
```

### When to Use Agents vs Direct Extraction

**Use Direct Extraction When:**

- One-off extractions
- Different schemas for different documents
- Simple workflows
- Getting started quickly

**Use Extraction Agents When:**

- Repeated extractions with the same schema
- Team collaboration (shared, named extractors)
- Complex workflows requiring state management
- Production systems with consistent extraction patterns

### Index

### Usage

You can create an index on LlamaCloud using the following code. By default, new indexes use managed embeddings (OpenAI text-embedding-3-small, 1536 dimensions, 1 credit/page):

```python
import os

from llama_index.core import SimpleDirectoryReader
from llama_cloud_services import LlamaCloudIndex

# create a new index (uses managed embeddings by default)
index = LlamaCloudIndex.from_documents(
    documents,
    "my_first_index",
    project_name="default",
    api_key="llx-...",
    verbose=True,
)

# connect to an existing index
index = LlamaCloudIndex("my_first_index", project_name="default")
```

You can also configure a retriever for managed retrieval:

```python
# from the existing index
index.as_retriever()

# from scratch
from llama_cloud_services import LlamaCloudRetriever

retriever = LlamaCloudRetriever("my_first_index", project_name="default")
```

And of course, you can use other index shortcuts to get use out of your new managed index:

```python
query_engine = index.as_query_engine(llm=llm)

chat_engine = index.as_chat_engine(llm=llm)
```

## Retriever Settings

A full list of retriever settings/kwargs is below:

- `dense_similarity_top_k`: Optional[int] -- If greater than 0, retrieve `k` nodes using dense retrieval
- `sparse_similarity_top_k`: Optional[int] -- If greater than 0, retrieve `k` nodes using sparse retrieval
- `enable_reranking`: Optional[bool] -- Whether to enable reranking or not. Sacrifices some speed for accuracy
- `rerank_top_n`: Optional[int] -- The number of nodes to return after reranking initial retrieval results
- `alpha` Optional[float] -- The weighting between dense and sparse retrieval. 1 = Full dense retrieval, 0 = Full sparse retrieval.

# Building with LlamaCloud in TypeScript

## A compendium of examples and explanations

### Introduction

[LlamaCloud](https://cloud.llamaindex.ai/) is a cloud platform provided by LlamaIndex for intelligent document processing.

It is composed of three main services:

- [LlamaParse](https://www.llamaindex.ai/llamaparse), for parsing and extracting text, charts, tables and images from unstructured files
- [LlamaExtract](https://www.llamaindex.ai/llamaextract), for extracting structured data from files following specific patterns
- LlamaCloud Index, for storing, indexing and retrieving documents, especially oriented towards retrieval-augmented generation.

You can interact with LlamaCloud services through a TypeScript SDK, that you can easily obtain by installing it from NPM:

```bash
npm install llama-cloud-services
```

Let's see some examples of how to interact with the various services.

### Parse

You can interact with Parse as in the following code:

```tsx
import { LlamaParseReader } from "llama-cloud-services";

const reader = new LlamaParseReader({ resultType: "markdown" });
// this would return an array of Document containing text under the text attribute
const documents = await reader.loadData("my-file.pdf");
// this would return an array of the JSON representation of all elements of the parsing job contained under the pages attribute
const result = await reader.parse("my-file.pdf"); // you can also use file bytes a Uint8Array here
```

You can then extract images or tables:

```tsx
const images = await reader.getImages(result, "static/images"); // specify a download path
const tables = await reader.getTables(result, "data/tables"); // this will return an array of strings pointing to the paths of the CSV files where the tables are saved
```

> Remember to export your LLAMA_CLOUD_API_KEY as an environment variable!

### Extract

You can interact with Extract as in the following code:

```tsx
import { LlamaExtract } from "llama-cloud-services";

const extractClient = new LlamaExtract(
  process.env.LLAMA_CLOUD_API_KEY!,
  "<https://api.cloud.llamaindex.ai>", // specify the base URL
);
```

You need to define a data schema (in JSON format) to perform extraction:

```tsx
const dataSchema = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "Text from the file",
    },
  },
  required: ["text"],
};
```

You can then use the data schema to perform extraction directly, or to create an extraction agent and extract data with it:

```tsx
// Create an agent
const agent = await extractClient.createAgent("TextAgent", dataSchema);

// if you already created an agent, you can fetch it with its name
const namedAgent = await extractClient.getAgent("TextAgent");

// Extract with the agent
const result = await agent.extract("test-extract-agent.md");

// Or you can extract directly from a file buffer
const buffer = await fs.readFile("test-extract-agent.md");
const resultBuffer = await agent!.extract(
  undefined, // leave the path undefined
  buffer,
  "test-extract-agent.md", // specify the filename - highly recommended!
);
```

As said, you can perform all these same operation directly with a LlamaExtract instance, using the `extract` method and specifying the extraction schema and the extraction configuration:

```tsx
import { ExtractConfig } from "llama-cloud-services";

const result = await extractClient.extract(
  dataSchema,
  {} as ExtractConfig,
  "test-extract.md",
);
```

The results will be `ExtractResult` objects, with the `data` attribute (the JSON representation of the extracted data) and the `extractionMetadata` attribute (metadata about the extraction).

### Index

You can interact with Index as in the following code:

```tsx
import { LlamaCloudIndex } from "llama-cloud-services";

const index = new LlamaCloudIndex({
  name: process.env.PIPELINE_NAME as string,
  projectName: "Default",
  apiKey: process.env.LLAMA_CLOUD_API_KEY, // can provide API-key in the constructor or in the env
});

// use Index as retriever
const retriever = index.asRetriever({
  similarityTopK: 5,
});
```

Retrieve nodes and use them for RAG purposes:

```tsx
const nodes = await retriever.retrieve(
  "How many cells are in the human brain?",
); // the query here is a string
```

Here is a simple example of how to insert the retrieved nodes inside a RAG framework:

```tsx
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { NodeWithScore, MetadataMode } from "llamaindex";

export async function retrievalAugmentedGeneration(
  nodes: NodeWithScore[],
  prompt: string,
): Promise<string> {
  let mainText: string = "";

  for (const node of nodes) {
    mainText += `\\t{information: '${node.node.getContent(
      MetadataMode.ALL,
    )}', relevanceScore: '${node.score ?? "no score"}'}\\n`;
  }

  const { text } = await generateText({
    model: openai("gpt-4.1"),
    prompt: `[\\n${mainText}\\n]\\n\\nBased on the information you are given and on the relevance score of that (where -1 means no score available), answer to this user prompt: '${prompt}'`,
  });

  return text;
}
```
