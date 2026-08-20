import { IconArrowsSort, IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table"
import { useState } from "react"
import { cn } from "tailwind-variants"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CanonicalNode } from "@/core/nodes"

const features = tableFeatures({
  columnFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    equalsString: filterFn_equalsString,
    includesString: filterFn_includesString,
  },
  sortFns: { text: sortFn_text },
})

const columnHelper = createColumnHelper<typeof features, CanonicalNode>()

function SortableHeader({
  label,
  column,
}: {
  label: string
  column: { getIsSorted(): false | "asc" | "desc"; toggleSorting(desc?: boolean): void }
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <IconArrowsSort data-icon="inline-end" />
    </Button>
  )
}

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: ({ column }) => <SortableHeader label="名称" column={column} />,
    cell: ({ row }) => (
      <span className="block max-w-48 truncate font-medium">{row.original.name}</span>
    ),
    filterFn: "includesString",
    sortFn: "text",
  }),
  columnHelper.accessor("type", {
    header: ({ column }) => <SortableHeader label="协议" column={column} />,
    cell: ({ row }) => <Badge variant="secondary">{row.original.type}</Badge>,
    filterFn: "equalsString",
    sortFn: "text",
  }),
  columnHelper.accessor("server", {
    header: ({ column }) => <SortableHeader label="服务器" column={column} />,
    cell: ({ row }) => (
      <span className="block max-w-56 truncate font-mono text-xs">
        {row.original.server}:{row.original.port}
      </span>
    ),
    sortFn: "text",
  }),
])

export function NodeTable({ className, nodes }: { className?: string; nodes: CanonicalNode[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const protocols = [...new Set(nodes.map((node) => node.type))].toSorted()
  const protocolOptions = [
    { label: "全部协议", value: "all" },
    ...protocols.map((protocol) => ({ label: protocol, value: protocol })),
  ]
  const table = useTable({
    features,
    columns,
    data: nodes,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
  })
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <FieldGroup className="gap-4 flex-row">
        <Field>
          <FieldLabel htmlFor="node-name-filter">搜索名称</FieldLabel>
          <Input
            id="node-name-filter"
            placeholder="输入节点名称…"
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="node-type-filter">协议</FieldLabel>
          <Select
            items={protocolOptions}
            value={(table.getColumn("type")?.getFilterValue() as string) || "all"}
            onValueChange={(value) =>
              table.getColumn("type")?.setFilterValue(!value || value === "all" ? "" : value)
            }
          >
            <SelectTrigger id="node-type-filter" className="min-w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {protocolOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      {/* Scrolls inside the panel so the pager stays pinned to the bottom. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-28 text-center text-muted-foreground"
                >
                  没有匹配的节点。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {filteredCount} 个节点 · 第 {table.state.pagination.pageIndex + 1} /{" "}
          {Math.max(table.getPageCount(), 1)} 页
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="上一页"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="下一页"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
